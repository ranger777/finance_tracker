from datetime import date, timedelta
from decimal import Decimal
import sqlite3
from database import get_db, calculate_period_dates
from models import TransactionCreate, CategoryCreate


def get_categories(category_type: str = None):
    """Получить список категорий"""
    with get_db() as conn:
        query = "SELECT * FROM categories WHERE is_active = TRUE"
        params = []

        if category_type:
            query += " AND type = ?"
            params.append(category_type)

        query += " ORDER BY type, name"
        categories = conn.execute(query, params).fetchall()
        return [dict(cat) for cat in categories], None


def create_category(category: CategoryCreate):
    """Создать новую категорию"""
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "INSERT INTO categories (name, type, color) VALUES (?, ?, ?)",
                (category.name, category.type, category.color)
            )
            conn.commit()
            return cursor.lastrowid, None
    except sqlite3.IntegrityError:
        return None, "Категория с таким именем и типом уже существует"  # ⬅️ Обновили текст
    except sqlite3.Error as e:
        return None, f"Ошибка базы данных: {str(e)}"


def create_transaction(transaction: TransactionCreate):
    """Создать новую транзакцию"""
    try:
        with get_db() as conn:
            # Проверяем существование категории
            category_exists = conn.execute(
                "SELECT id FROM categories WHERE id = ?",
                (transaction.category_id,)
            ).fetchone()

            if not category_exists:
                return None, "Категория не найдена"

            cursor = conn.execute(
                "INSERT INTO transactions (amount, category_id, date, description) VALUES (?, ?, ?, ?)",
                (float(transaction.amount), transaction.category_id, transaction.date, transaction.description)
            )
            conn.commit()
            return cursor.lastrowid, None
    except sqlite3.Error as e:
        return None, f"Ошибка базы данных: {str(e)}"


def get_transactions(start_date: date = None, end_date: date = None):
    """Получить транзакции за период"""
    try:
        with get_db() as conn:
            query = '''
                SELECT t.*, c.name as category_name, c.type as category_type, c.color as category_color
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE 1=1
            '''
            params = []

            if start_date:
                query += " AND t.date >= ?"
                params.append(start_date)
            if end_date:
                query += " AND t.date <= ?"
                params.append(end_date)

            query += " ORDER BY t.date DESC, t.created_at DESC"

            transactions = conn.execute(query, params).fetchall()
            return [dict(tran) for tran in transactions], None
    except sqlite3.Error as e:
        return None, f"Ошибка базы данных: {str(e)}"


def get_analytics(period: str = "month", start_date: date = None, end_date: date = None, group_by: str = "category"):
    """Получить аналитику по транзакциям"""
    try:
        with get_db() as conn:
            # Определяем период
            if period != 'custom':
                start_date, end_date = calculate_period_dates(period)
            elif not start_date or not end_date:
                # Если period='custom', но даты не указаны - используем текущий месяц
                start_date, end_date = calculate_period_dates('month')

            # Общая статистика
            stats_query = '''
                SELECT 
                    COALESCE(SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
                    COALESCE(SUM(CASE WHEN c.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE 1=1
            '''
            stats_params = []

            if start_date:
                stats_query += " AND t.date >= ?"
                stats_params.append(start_date)
            if end_date:
                stats_query += " AND t.date <= ?"
                stats_params.append(end_date)

            stats = conn.execute(stats_query, stats_params).fetchone()

            # По категориям
            category_query = '''
                SELECT 
                    c.name as category_name,
                    c.type as category_type, 
                    c.color as category_color,
                    SUM(t.amount) as total
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE 1=1
            '''
            category_params = []

            if start_date:
                category_query += " AND t.date >= ?"
                category_params.append(start_date)
            if end_date:
                category_query += " AND t.date <= ?"
                category_params.append(end_date)

            category_query += '''
                GROUP BY c.id, c.name, c.type, c.color
                ORDER BY c.type, total DESC
            '''

            by_category = conn.execute(category_query, category_params).fetchall()

            # Ежедневные итоги
            daily_query = '''
                SELECT 
                    t.date,
                    SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END) as income,
                    SUM(CASE WHEN c.type = 'expense' THEN t.amount ELSE 0 END) as expense
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE 1=1
            '''
            daily_params = []

            if start_date:
                daily_query += " AND t.date >= ?"
                daily_params.append(start_date)
            if end_date:
                daily_query += " AND t.date <= ?"
                daily_params.append(end_date)

            daily_query += " GROUP BY t.date ORDER BY t.date"

            daily_totals = conn.execute(daily_query, daily_params).fetchall()

            result = {
                'total_income': Decimal(str(stats['total_income'])),
                'total_expense': Decimal(str(stats['total_expense'])),
                'balance': Decimal(str(stats['total_income'] - stats['total_expense'])),
                'by_category': [dict(row) for row in by_category],
                'daily_totals': [dict(row) for row in daily_totals],
                'period': {
                    'start_date': start_date.isoformat() if start_date else None,
                    'end_date': end_date.isoformat() if end_date else None,
                    'type': period
                }
            }

            return result, None

    except sqlite3.Error as e:
        return None, f"Ошибка базы данных: {str(e)}"