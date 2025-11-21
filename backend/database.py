import sqlite3
from datetime import datetime, date, timedelta
from contextlib import contextmanager
import os

DATABASE_URL = "data/finance.db"


def calculate_period_dates(period: str):
    """Вычисляет даты начала и конца для стандартных периодов"""
    today = date.today()

    if period == 'today':
        return today, today
    elif period == 'week':
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    elif period == 'month':
        start = today.replace(day=1)
        end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return start, end
    elif period == 'quarter':
        quarter = (today.month - 1) // 3 + 1
        start_month = 3 * quarter - 2
        start = date(today.year, start_month, 1)
        end_month = 3 * quarter
        end = date(today.year, end_month, 1) + timedelta(days=32)
        end = end.replace(day=1) - timedelta(days=1)
        return start, end
    elif period == 'year':
        return date(today.year, 1, 1), date(today.year, 12, 31)
    elif period == 'all':
        return None, None
    else:
        # По умолчанию текущий месяц
        start = today.replace(day=1)
        end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return start, end


@contextmanager
def get_db():
    """Менеджер контекста для работы с БД"""
    # Создаем папку data если её нет
    os.makedirs("data", exist_ok=True)

    conn = sqlite3.connect(DATABASE_URL)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        # Таблица категорий (гибкая система)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'savings_income', 'savings_expense')),
                color TEXT DEFAULT '#007bff',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, type)
            )
        ''')

        # Таблица транзакций (оставляем без изменений)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount DECIMAL(10,2) NOT NULL,
                category_id INTEGER NOT NULL,
                date DATE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories (id)
            )
        ''')

        # Добавляем базовые категории (теперь можно иметь одинаковые имена с разными типами)
        default_categories = [
            # копилка
            ('Изъять на нужды', 'savings_income', '#ff0000'),
            ('Накопления', 'savings_expense', '#00ff00'),

            # Доходы
            ('Подарок', 'income', '#28a745'),
            ('Зарплата', 'income', '#20c997'),
            ('Перевод частный', 'income', '#17a2b8'),

            # Расходы
            ('Продукты', 'expense', '#e83e8c'),
            ('Связь', 'expense', '#007bff'),
            ('Транспорт', 'expense', '#ffc107'),
            ('Развлечения', 'expense', '#6610f2'),
            ('Кафе и рестораны', 'expense', '#e83e8c'),
            ('Здоровье', 'expense', '#dc3545')
        ]

        # Используем INSERT OR IGNORE чтобы избежать дубликатов
        conn.executemany(
            'INSERT OR IGNORE INTO categories (name, type, color) VALUES (?, ?, ?)',
            default_categories
        )

        # Таблица для настроек (только одна запись)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                password_hash TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Создаем запись настроек если её нет
        conn.execute('''
            INSERT OR IGNORE INTO app_settings (id, password_hash) 
            VALUES (1, NULL)
        ''')

        conn.commit()

# Инициализируем БД при импорте
init_db()