from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from datetime import date
from typing import Optional
import sqlite3
import os

from models import *
from crud import *
from database import calculate_period_dates

app = FastAPI(
    title="Finance Tracker API",
    description="Персональный трекер доходов и расходов",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/categories", response_model=list[Category])
async def read_categories(category_type: Optional[str] = None):
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
async def create_new_category(category: CategoryCreate):
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
        include_savings: bool = True
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
async def create_new_transaction(transaction: TransactionCreate):
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
async def get_analytics_data(request: AnalyticsRequest):
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

# Новый endpoint для статистики копилки
@app.post("/api/analytics/savings", response_model=AnalyticsResponse)
async def get_savings_analytics(request: AnalyticsRequest):
    """Получить аналитику по копилке"""
    try:
        # Для копилки всегда включаем savings транзакции
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
async def get_available_periods():
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

@app.get("/")
async def serve_frontend():
    return FileResponse("../frontend/index.html")

app.mount("/", StaticFiles(directory="../frontend"), name="frontend")

if __name__ == "__main__":
    import uvicorn

    print("🚀 Запуск финансового трекера...")
    print("📊 Бекенд API: http://localhost:8000")
    print("🎨 Фронтенд: http://localhost:8000")
    print("📚 Документация API: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)