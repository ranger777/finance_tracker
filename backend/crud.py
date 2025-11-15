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
        return None, "Категория с таким именем и типом уже существует"
    except sqlite3.Error as e:
        return None, f"Ошибка базы данных: {str(e)}"


def create_transaction(transaction: TransactionCreate):
    """Создать новую транзакцию"""
    try:
        with get_db() as conn:
            # Проверяем существование категории
            category_exists = conn.execute(
                "SELECT id, type FROM categories WHERE id = ?",
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


def get_transactions(start_date: date = None, end_date: date = None, include_savings: bool = True):
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

            if not include_savings:
                query += " AND c.type NOT IN ('savings_income', 'savings_expense')"

            query += " ORDER BY t.date DESC, t.created_at DESC"

            transactions = conn.execute(query, params).fetchall()
            return [dict(tran) for tran in transactions], None
    except sqlite3.Error as e:
        return None, f"Ошибка базы данных: {str(e)}"


def get_analytics(period: str = "month", start_date: date = None, end_date: date = None,
                  group_by: str = "category", include_savings: bool = False):
    """Получить аналитику по транзакциям"""
    try:
        with get_db() as conn:
            # Определяем период
            if period != 'custom':
                start_date, end_date = calculate_period_dates(period)
            elif not start_date or not end_date:
                start_date, end_date = calculate_period_dates('month')

            # Базовые условия WHERE
            base_where = "WHERE 1=1"
            base_params = []
            savings_where = "WHERE 1=1"
            savings_params = []

            if start_date:
                base_where += " AND t.date >= ?"
                base_params.append(start_date)
                savings_where += " AND t.date >= ?"
                savings_params.append(start_date)
            if end_date:
                base_where += " AND t.date <= ?"
                base_params.append(end_date)
                savings_where += " AND t.date <= ?"
                savings_params.append(end_date)

            # Общая статистика (исключаем копилку если не запрошено)
            type_filter = "" if include_savings else " AND c.type NOT IN ('savings_income', 'savings_expense')"

            stats_query = f'''
                SELECT 
                    COALESCE(SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
                    COALESCE(SUM(CASE WHEN c.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense,
                    COALESCE(SUM(CASE WHEN c.type = 'savings_income' THEN t.amount ELSE 0 END), 0) as savings_income,
                    COALESCE(SUM(CASE WHEN c.type = 'savings_expense' THEN t.amount ELSE 0 END), 0) as savings_expense
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                {base_where} {type_filter}
            '''

            stats = conn.execute(stats_query, base_params).fetchone()

            # Статистика по копилке
            savings_query = f'''
                SELECT 
                    COALESCE(SUM(CASE WHEN c.type = 'savings_income' THEN t.amount ELSE 0 END), 0) as savings_income,
                    COALESCE(SUM(CASE WHEN c.type = 'savings_expense' THEN t.amount ELSE 0 END), 0) as savings_expense
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                {savings_where} AND c.type IN ('savings_income', 'savings_expense')
            '''
            savings_stats = conn.execute(savings_query, savings_params).fetchone()

            # По категориям (с фильтром по копилке)
            category_query = f'''
                SELECT 
                    c.name as category_name,
                    c.type as category_type, 
                    c.color as category_color,
                    SUM(t.amount) as total
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                {base_where} {type_filter}
                GROUP BY c.id, c.name, c.type, c.color
                ORDER BY c.type, total DESC
            '''

            by_category = conn.execute(category_query, base_params).fetchall()

            # Ежедневные итоги
            daily_query = f'''
                SELECT 
                    t.date,
                    SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END) as income,
                    SUM(CASE WHEN c.type = 'expense' THEN t.amount ELSE 0 END) as expense
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                {base_where} {type_filter}
                GROUP BY t.date ORDER BY t.date
            '''

            daily_totals = conn.execute(daily_query, base_params).fetchall()

            result = {
                'total_income': Decimal(str(stats['total_income'])),
                'total_expense': Decimal(str(stats['total_expense'])),
                'balance': Decimal(str(stats['total_income'] - stats['total_expense'])),
                'savings_income': Decimal(str(savings_stats['savings_income'])),
                'savings_expense': Decimal(str(savings_stats['savings_expense'])),
                'savings_balance': Decimal(str(savings_stats['savings_income'] - savings_stats['savings_expense'])),
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