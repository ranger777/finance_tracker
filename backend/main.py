import webbrowser

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from datetime import date, datetime, timedelta
from typing import Optional
import sqlite3
import os
from passlib.context import CryptContext
import secrets
import json
from pydantic import ValidationError

from models import *
from crud import *
from database import calculate_period_dates, get_db

PORT = 8101

app = FastAPI(
    title="Finance Tracker API",
    description="Персональный трекер доходов и расходов",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f'http://localhost:{PORT}', f'http://127.0.0.1:{PORT}'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# сразу запускаем страничку
webbrowser.open(f'http://localhost:{PORT}')

# Хеширование паролей - используем argon2 вместо bcrypt (нет ограничения по длине)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def get_password_hash(password: str):
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str):
    if not hashed_password:
        print("❌ [AUTH] No hash to verify")
        return False
    print(f"🔐 [AUTH] Verifying: '{plain_password}' against hash")
    try:
        result = pwd_context.verify(plain_password, hashed_password)
        print(f"🔐 [AUTH] Verification result: {result}")
        return result
    except Exception as e:
        print(f"❌ [AUTH] Verification error: {e}")
        return False


def get_app_settings():
    """Получить настройки приложения"""
    with get_db() as conn:
        settings = conn.execute(
            "SELECT * FROM app_settings WHERE id = 1"
        ).fetchone()
        result = dict(settings) if settings else None
        print(f"🔐 [DATABASE] get_app_settings result: {result}")
        return result


def update_password_hash(password_hash: str):
    """Обновить хеш пароля"""
    print(f"🔐 [DATABASE] Updating password hash: {password_hash}")
    with get_db() as conn:
        conn.execute(
            "UPDATE app_settings SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
            (password_hash,)
        )
        conn.commit()
    print("🔐 [DATABASE] Password hash updated")


def create_auth_token():
    """Создать токен аутентификации"""
    issued_at = datetime.utcnow()
    expires_at = issued_at + timedelta(hours=24)  # Увеличиваем время жизни

    token_data = {
        "authenticated": True,
        "issued_at": issued_at.isoformat(),
        "expires_at": expires_at.isoformat()
    }

    return token_data


def verify_auth_token(token_data: dict):
    """Проверить валидность токена"""
    if not token_data or not token_data.get("authenticated"):
        return False

    try:
        expires_at = datetime.fromisoformat(token_data["expires_at"])
        return datetime.utcnow() < expires_at
    except:
        return False


# Зависимость для проверки аутентификации
async def get_current_user(request: Request):
    # Пробуем получить токен из заголовка Authorization
    auth_header = request.headers.get("Authorization")
    token = None

    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]  # Убираем "Bearer "

    if not token:
        # Если нет в заголовке, пробуем получить из query параметра (для отладки)
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Требуется аутентификация")

    try:
        token_data = json.loads(token)
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="Неверный формат токена")

    if not verify_auth_token(token_data):
        raise HTTPException(status_code=401, detail="Токен истек или недействителен")

    return token_data


# Эндпоинты аутентификации
@app.post("/api/auth/setup")
async def setup_password(credentials: PasswordSetup):
    """Первоначальная установка пароля"""
    print("🔐 [BACKEND] Setup password request received")

    settings = get_app_settings()

    # Если пароль уже установлен - запрещаем
    if settings and settings.get('password_hash'):
        print("❌ [BACKEND] Password already set")
        return JSONResponse(
            status_code=400,
            content={"detail": "Пароль уже установлен"}
        )

    password = credentials.password
    password_confirm = credentials.password_confirm

    if not password or not password_confirm:
        print("❌ [BACKEND] Missing password fields")
        return JSONResponse(
            status_code=400,
            content={"detail": "Заполните все поля"}
        )

    if password != password_confirm:
        print("❌ [BACKEND] Passwords don't match")
        return JSONResponse(
            status_code=400,
            content={"detail": "Пароли не совпадают"}
        )

    if len(password) < 4:
        print("❌ [BACKEND] Password too short")
        return JSONResponse(
            status_code=400,
            content={"detail": "Пароль должен быть не менее 4 символов"}
        )

    # Сохраняем пароль
    print("🔐 [BACKEND] Generating password hash...")
    password_hash = get_password_hash(password)
    print(f"🔐 [BACKEND] Generated hash: {password_hash}")

    print("🔐 [BACKEND] Updating database...")
    update_password_hash(password_hash)

    token = create_auth_token()
    print("✅ [BACKEND] Password setup successful")

    return {"success": True, "token": token}


@app.post("/api/auth/login")
async def login(credentials: LoginRequest):
    """Аутентификация пользователя"""
    print(f"🔐 [BACKEND] Login request received")
    print(f"🔐 [BACKEND] Password length: {len(credentials.password)}")
    print(f"🔐 [BACKEND] Password value: '{credentials.password}'")

    settings = get_app_settings()

    # Если пароль еще не установлен
    if not settings or not settings.get('password_hash'):
        print("❌ [BACKEND] No password set")
        return JSONResponse(
            status_code=400,
            content={"detail": "Сначала установите пароль"}
        )

    password = credentials.password

    print(f"🔐 [BACKEND] Stored hash: {settings['password_hash']}")
    print(f"🔐 [BACKEND] Verifying password...")

    is_valid = verify_password(password, settings['password_hash'])
    print(f"🔐 [BACKEND] Password valid: {is_valid}")

    if is_valid:
        token = create_auth_token()
        print("✅ [BACKEND] Login successful")
        return {"success": True, "token": token}
    else:
        print("❌ [BACKEND] Invalid password")
        return JSONResponse(
            status_code=401,
            content={"detail": "Неверный пароль"}
        )


@app.post("/api/auth/verify")
async def verify_token(request: Request):
    """Проверить валидность токена"""
    try:
        # Получаем токен из тела запроса
        body = await request.json()
        token_data = body
        valid = verify_auth_token(token_data)
        return {"valid": valid}
    except:
        return {"valid": False}


@app.post("/api/auth/change-password")
async def change_password(credentials: PasswordChange, current_user: dict = Depends(get_current_user)):
    """Смена пароля"""
    settings = get_app_settings()

    old_password = credentials.old_password
    new_password = credentials.new_password
    new_password_confirm = credentials.new_password_confirm

    # Проверяем старый пароль
    if not verify_password(old_password, settings['password_hash']):
        return JSONResponse(
            status_code=401,
            content={"detail": "Неверный текущий пароль"}
        )

    # Проверяем новый пароль
    if not new_password or not new_password_confirm:
        return JSONResponse(
            status_code=400,
            content={"detail": "Заполните все поля"}
        )

    if new_password != new_password_confirm:
        return JSONResponse(
            status_code=400,
            content={"detail": "Новые пароли не совпадают"}
        )

    if len(new_password) < 4:
        return JSONResponse(
            status_code=400,
            content={"detail": "Пароль должен быть не менее 4 символов"}
        )

    # Обновляем пароль
    new_password_hash = get_password_hash(new_password)
    update_password_hash(new_password_hash)

    return {"success": True}


@app.get("/api/auth/status")
async def get_auth_status():
    """Получить статус аутентификации (установлен ли пароль)"""
    settings = get_app_settings()
    return {
        "password_set": bool(settings and settings.get('password_hash'))
    }


# Защищенные эндпоинты (добавляем зависимость аутентификации)
@app.get("/api/categories", response_model=list[Category])
async def read_categories(category_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Получить список категорий"""
    try:
        categories, error = get_categories(category_type)
        if error:
            return JSONResponse(
                status_code=500,
                content={"detail": error}
            )
        return categories
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.post("/api/categories")
async def create_new_category(category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    """Создать новую категорию"""
    try:
        category_id, error = create_category(category)
        if error:
            return JSONResponse(
                status_code=400,
                content={"detail": error}
            )
        return {"id": category_id, "status": "created"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.get("/api/transactions")
async def read_transactions(
        period: str = "month",
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_savings: bool = True,
        current_user: dict = Depends(get_current_user)
):
    """Получить транзакции за период"""
    try:
        if period != "custom":
            start_date, end_date = calculate_period_dates(period)

        transactions, error = get_transactions(start_date, end_date, include_savings)
        if error:
            return JSONResponse(
                status_code=500,
                content={"detail": error}
            )
        return transactions
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.post("/api/transactions")
async def create_new_transaction(transaction: TransactionCreate, current_user: dict = Depends(get_current_user)):
    """Создать новую транзакцию"""
    try:
        transaction_id, error = create_transaction(transaction)
        if error:
            return JSONResponse(
                status_code=400,
                content={"detail": error}
            )
        return {"id": transaction_id, "status": "created"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.post("/api/analytics", response_model=AnalyticsResponse)
async def get_analytics_data(request: AnalyticsRequest, current_user: dict = Depends(get_current_user)):
    """Получить аналитику по транзакциям"""
    try:
        analytics, error = get_analytics(
            period=request.period,
            start_date=request.start_date,
            end_date=request.end_date,
            group_by=request.group_by,
            include_savings=request.include_savings
        )
        if error:
            return JSONResponse(
                status_code=500,
                content={"detail": error}
            )
        return analytics
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.post("/api/analytics/savings", response_model=AnalyticsResponse)
async def get_savings_analytics(request: AnalyticsRequest, current_user: dict = Depends(get_current_user)):
    """Получить аналитику по копилке"""
    try:
        analytics, error = get_analytics(
            period=request.period,
            start_date=request.start_date,
            end_date=request.end_date,
            group_by=request.group_by,
            include_savings=True
        )
        if error:
            return JSONResponse(
                status_code=500,
                content={"detail": error}
            )
        return analytics
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.get("/api/periods")
async def get_available_periods(current_user: dict = Depends(get_current_user)):
    """Получить список доступных периодов"""
    return {
        "periods": [
            {"value": "today", "label": "Сегодня"},
            {"value": "week", "label": "Текущая неделя"},
            {"value": "month", "label": "Текущий месяц"},
            {"value": "quarter", "label": "Текущий квартал"},
            {"value": "year", "label": "Текущий год"},
            {"value": "all", "label": "Все время"},
            {"value": "custom", "label": "Произвольный период"}
        ]
    }


@app.put("/api/categories/{category_id}")
async def update_category(category_id: int, category_update: dict, current_user: dict = Depends(get_current_user)):
    """Обновить категорию (пока только цвет)"""
    try:
        with get_db() as conn:
            # Проверяем существование категории
            category_exists = conn.execute(
                "SELECT id FROM categories WHERE id = ?",
                (category_id,)
            ).fetchone()

            if not category_exists:
                return JSONResponse(
                    status_code=404,
                    content={"detail": "Категория не найдена"}
                )

            # Обновляем только цвет
            if 'color' in category_update:
                conn.execute(
                    "UPDATE categories SET color = ? WHERE id = ?",
                    (category_update['color'], category_id)
                )
                conn.commit()

            return {"status": "updated"}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.put("/api/transactions/{transaction_id}")
async def update_transaction(transaction_id: int, transaction_update: dict,
                             current_user: dict = Depends(get_current_user)):
    """Обновить транзакцию"""
    try:
        print(f"Received update data: {transaction_update}")

        # Преобразуем строку даты в объект date (всегда должна быть)
        if 'date' in transaction_update and transaction_update['date']:
            try:
                if isinstance(transaction_update['date'], str):
                    transaction_update['date'] = datetime.strptime(transaction_update['date'], '%Y-%m-%d').date()
            except ValueError:
                return JSONResponse(
                    status_code=422,
                    content={"detail": "Неверный формат даты. Используйте YYYY-MM-DD"}
                )

        # Преобразуем amount в Decimal (всегда должен быть)
        if 'amount' in transaction_update:
            try:
                transaction_update['amount'] = Decimal(str(transaction_update['amount']))
            except:
                return JSONResponse(
                    status_code=422,
                    content={"detail": "Неверный формат суммы"}
                )

        # Валидируем данные
        try:
            validated_data = TransactionUpdate(**transaction_update)
        except ValidationError as e:
            return JSONResponse(
                status_code=422,
                content={"detail": f"Ошибка валидации: {e}"}
            )

        updated_id, error = update_transaction_crud(transaction_id, validated_data)
        if error:
            return JSONResponse(
                status_code=400,
                content={"detail": error}
            )
        return {"id": updated_id, "status": "updated"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.delete("/api/transactions/{transaction_id}")
async def delete_transaction_endpoint(transaction_id: int, current_user: dict = Depends(get_current_user)):
    """Удалить транзакцию"""
    try:
        deleted_id, error = delete_transaction_crud(transaction_id)
        if error:
            return JSONResponse(
                status_code=400,
                content={"detail": error}
            )
        return {"id": deleted_id, "status": "deleted"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Внутренняя ошибка сервера: {str(e)}"}
        )


@app.get("/")
async def serve_frontend():
    return FileResponse("../frontend/index.html")


app.mount("/", StaticFiles(directory="../frontend"), name="frontend")

if __name__ == "__main__":
    import uvicorn

    try:
        print("🚀 Запуск финансового трекера...")
        print(f"📊 Бекенд API: http://localhost:{PORT}")
        print(f"🎨 Фронтенд: http://localhost:{PORT}")
        print(f"📚 Документация API: http://localhost:{PORT}/docs")
        uvicorn.run(app, host="0.0.0.0", port=PORT)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        print("⚠️  Нажмите Enter для выхода...")
        input()  # Ждет нажатия Enter
