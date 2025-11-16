from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List
from decimal import Decimal

class CategoryBase(BaseModel):
    name: str
    type: str  # 'income', 'expense', 'savings_income', 'savings_expense'
    color: Optional[str] = '#007bff'

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    amount: Decimal
    category_id: int
    date: date
    description: Optional[str] = None

class TransactionCreate(TransactionBase):
    pass

class Transaction(TransactionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class TransactionWithCategory(Transaction):
    category_name: str
    category_type: str
    category_color: str

class AnalyticsRequest(BaseModel):
    period: str = "month"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    group_by: Optional[str] = 'category'
    include_savings: bool = False  # Новый параметр

class AnalyticsResponse(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    balance: Decimal
    by_category: List[dict]
    daily_totals: List[dict]
    savings_daily_totals: List[dict]  # НОВОЕ ПОЛЕ
    period: dict
    # Для копилки
    savings_income: Optional[Decimal] = Decimal('0')
    savings_expense: Optional[Decimal] = Decimal('0')
    savings_balance: Optional[Decimal] = Decimal('0')

class TransactionUpdate(BaseModel):
    amount: Optional[Decimal] = None
    category_id: Optional[int] = None
    date: Optional[date] = None
    description: Optional[str] = None