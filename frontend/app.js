class FinanceTracker {
    constructor() {
        this.apiUrl = 'http://localhost:8000/api';
        this.categories = [];
        this.transactions = [];
        this.analytics = null;

        // Загружаем период из localStorage или используем по умолчанию
        this.currentPeriod = localStorage.getItem('selectedPeriod') || 'month';

        // Храним ссылки на графики
        this.categoryChart = null;
        this.dailyChart = null;

        this.init();
    }

    async init() {
        document.getElementById('date').value = new Date().toISOString().split('T')[0];

        // Устанавливаем выбранный период в select
        document.getElementById('periodSelect').value = this.currentPeriod;
        this.toggleCustomDateRange();

        this.setupEventListeners();
        await this.loadCategories();
        await this.loadTransactions();
        await this.loadAnalytics();
    }

    setupEventListeners() {
        document.getElementById('transactionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTransaction();
        });

        document.getElementById('categoryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addCategory();
        });

        document.getElementById('periodSelect').addEventListener('change', (e) => {
            this.currentPeriod = e.target.value;

            // Сохраняем выбор в localStorage
            localStorage.setItem('selectedPeriod', this.currentPeriod);

            this.toggleCustomDateRange();
            this.loadTransactions();
            this.loadAnalytics();
        });
    }

    toggleCustomDateRange() {
        const customRange = document.getElementById('customDateRange');
        if (this.currentPeriod === 'custom') {
            customRange.style.display = 'flex';

            // Автоматически устанавливаем даты для кастомного периода
            const today = new Date();
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');

            if (!startDateInput.value) {
                // По умолчанию - текущий месяц
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                startDateInput.value = firstDay.toISOString().split('T')[0];
            }

            if (!endDateInput.value) {
                endDateInput.value = today.toISOString().split('T')[0];
            }
        } else {
            customRange.style.display = 'none';
        }
    }

    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.apiUrl}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

        const data = await response.json();

        if (!response.ok) {
            // data теперь всегда содержит JSON с полем 'detail'
            const errorMessage = data.detail || `Ошибка ${response.status}`;
            alert(`Ошибка: ${errorMessage}`);
            throw new Error(errorMessage);
        }

        return data;

    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
    }

    async loadCategories() {
        try {
            this.categories = await this.apiCall('/categories');
            this.updateCategorySelects();
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }

    async loadTransactions() {
        try {
            let url = `/transactions?period=${this.currentPeriod}`;

            if (this.currentPeriod === 'custom') {
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;
                if (startDate && endDate) {
                    url += `&start_date=${startDate}&end_date=${endDate}`;
                }
            }

            this.transactions = await this.apiCall(url);
            this.renderTransactions();
        } catch (error) {
            console.error('Failed to load transactions:', error);
        }
    }

    async loadAnalytics() {
        try {
            const request = {
                period: this.currentPeriod,
                group_by: 'category'
            };

            if (this.currentPeriod === 'custom') {
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;
                if (startDate && endDate) {
                    request.start_date = startDate;
                    request.end_date = endDate;
                }
            }

            this.analytics = await this.apiCall('/analytics', {
                method: 'POST',
                body: JSON.stringify(request)
            });

            this.updateStats();
            this.renderCategoryAnalytics();
            this.renderCharts();
        } catch (error) {
            console.error('Failed to load analytics:', error);
        }
    }

    updateCategorySelects() {
        const categorySelect = document.getElementById('categorySelect');
        categorySelect.innerHTML = '<option value="">Выберите категорию</option>';

        const transactionType = document.getElementById('transactionType').value;
        const filteredCategories = this.categories.filter(cat => cat.type === transactionType);

        filteredCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            categorySelect.appendChild(option);
        });
    }

    async addTransaction() {
        const formData = {
            amount: parseFloat(document.getElementById('amount').value),
            category_id: parseInt(document.getElementById('categorySelect').value),
            date: document.getElementById('date').value,
            description: document.getElementById('description').value || ''
        };

        if (!formData.amount || !formData.category_id) {
            alert('Пожалуйста, заполните обязательные поля');
            return;
        }

        try {
            await this.apiCall('/transactions', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            document.getElementById('amount').value = '';
            document.getElementById('description').value = '';

            await this.loadTransactions();
            await this.loadAnalytics();

            alert('Транзакция добавлена!');
        } catch (error) {
            console.error('Failed to add transaction:', error);
        }
    }

    async addCategory() {
        const formData = {
            name: document.getElementById('categoryName').value,
            type: document.getElementById('categoryType').value,
            color: document.getElementById('categoryColor').value
        };

        if (!formData.name) {
            alert('Пожалуйста, введите название категории');
            return;
        }

        try {
            await this.apiCall('/categories', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            document.getElementById('categoryName').value = '';
            await this.loadCategories();
            alert('Категория добавлена!');
        } catch (error) {
            console.error('Failed to add category:', error);
        }
    }

    updateStats() {
        if (!this.analytics) return;

        document.getElementById('totalIncome').textContent =
            this.formatCurrency(this.analytics.total_income);
        document.getElementById('totalExpense').textContent =
            this.formatCurrency(this.analytics.total_expense);
        document.getElementById('totalBalance').textContent =
            this.formatCurrency(this.analytics.balance);

        const balanceCard = document.querySelector('.stat-card.balance');
        balanceCard.classList.remove('positive', 'negative');
        if (this.analytics.balance >= 0) {
            balanceCard.classList.add('positive');
        } else {
            balanceCard.classList.add('negative');
        }
    }

    renderTransactions() {
        const container = document.getElementById('transactionsList');
        container.innerHTML = '';

        if (this.transactions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #7f8c8d;">Транзакций нет</p>';
            return;
        }

        this.transactions.forEach(transaction => {
            const div = document.createElement('div');
            div.className = `transaction-item ${transaction.category_type}`;

            div.innerHTML = `
                <div class="transaction-info">
                    <span class="category" style="color: ${transaction.category_color}">
                        ${transaction.category_name}
                    </span>
                    <span class="description">${transaction.description || 'Без описания'}</span>
                    <span class="date">${this.formatDate(transaction.date)}</span>
                </div>
                <div class="amount">
                    ${this.formatCurrency(transaction.amount)}
                </div>
            `;

            container.appendChild(div);
        });
    }

    renderCategoryAnalytics() {
        if (!this.analytics) return;

        const container = document.getElementById('categoryAnalytics');
        container.innerHTML = '';

        this.analytics.by_category.forEach(item => {
            const div = document.createElement('div');
            div.className = 'analytics-item';

            div.innerHTML = `
                <div class="category-info">
                    <span class="color-dot" style="background: ${item.category_color}"></span>
                    <span>${item.category_name}</span>
                </div>
                <div class="amount">${this.formatCurrency(item.total)}</div>
            `;

            container.appendChild(div);
        });
    }

    renderCharts() {
        if (!this.analytics) return;

        // Уничтожаем старые графики перед созданием новых
        this.destroyCharts();

        this.renderCategoryChart();
        this.renderDailyChart();
    }

    destroyCharts() {
        // Уничтожаем график категорий
        if (this.categoryChart) {
            this.categoryChart.destroy();
            this.categoryChart = null;
        }

        // Уничтожаем график по дням
        if (this.dailyChart) {
            this.dailyChart.destroy();
            this.dailyChart = null;
        }
    }

    renderCategoryChart() {
    const ctx = document.getElementById('categoryChart').getContext('2d');

    // Разделяем данные на доходы и расходы
    const incomeData = this.analytics.by_category.filter(item => item.category_type === 'income');
    const expenseData = this.analytics.by_category.filter(item => item.category_type === 'expense');

    // Сортируем по убыванию суммы и берем топ-8 для читаемости
    const topIncomes = incomeData.sort((a, b) => b.total - a.total).slice(0, 8);
    const topExpenses = expenseData.sort((a, b) => b.total - a.total).slice(0, 8);

    this.categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [
                ...topIncomes.map(item => item.category_name),
                ...topExpenses.map(item => item.category_name)
            ],
            datasets: [
                {
                    label: 'Доходы',
                    data: [
                        ...topIncomes.map(item => item.total),
                        ...Array(topExpenses.length).fill(null) // Пустые значения для расходной части
                    ],
                    backgroundColor: topIncomes.map(item => item.category_color),
                    borderColor: topIncomes.map(item => this.adjustBrightness(item.category_color, -20)),
                    borderWidth: 1,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Расходы',
                    data: [
                        ...Array(topIncomes.length).fill(null), // Пустые значения для доходной части
                        ...topExpenses.map(item => item.total) // Положительные значения
                    ],
                    backgroundColor: topExpenses.map(item => item.category_color),
                    borderColor: topExpenses.map(item => this.adjustBrightness(item.category_color, -20)),
                    borderWidth: 1,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Горизонтальные столбцы
            plugins: {
                title: {
                    display: true,
                    text: 'Топ доходов и расходов по категориям',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            if (value === null) return '';
                            return `${context.dataset.label}: ${app.formatCurrency(value)}`;
                        }
                    }
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return app.formatCurrency(value);
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    title: {
                        display: true,
                        text: 'Сумма'
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

renderDailyChart() {
    const ctx = document.getElementById('dailyChart').getContext('2d');

    this.dailyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: this.analytics.daily_totals.map(item => this.formatDate(item.date)),
            datasets: [
                {
                    label: 'Доходы',
                    data: this.analytics.daily_totals.map(item => item.income),
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Расходы',
                    data: this.analytics.daily_totals.map(item => item.expense),
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Доходы и расходы по дням'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return app.formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}



// Вспомогательная функция для регулировки яркости цвета
adjustBrightness(hex, percent) {
    // Упрощенная функция для затемнения цвета границ
    return hex; // В реальном проекте можно добавить логику изменения яркости
}

    formatCurrency(amount) {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0
        }).format(amount);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('ru-RU');
    }

showSnackbar(message, type = 'success') {
        // Создаем снекбар
        const snackbar = document.createElement('div');
        snackbar.className = `snackbar ${type}`;

        const progressBar = type === 'success' ? '<div class="snackbar-progress"></div>' : '';

        snackbar.innerHTML = `
            <div class="snackbar-content">${message}</div>
            ${type === 'error' ? '<button class="snackbar-close">OK</button>' : ''}
            ${progressBar}
        `;

        document.body.appendChild(snackbar);

        // Показываем снекбар
        setTimeout(() => {
            snackbar.classList.add('show');
        }, 100);

        // Навешиваем обработчики
        if (type === 'error') {
            const closeBtn = snackbar.querySelector('.snackbar-close');
            closeBtn.addEventListener('click', () => {
                this.hideSnackbar(snackbar);
            });
        } else {
            // Автоматически скрываем успешные снекбары через 4 секунды
            setTimeout(() => {
                this.hideSnackbar(snackbar);
            }, 4000);
        }

        return snackbar;
    }

    hideSnackbar(snackbar) {
        snackbar.classList.remove('show');
        setTimeout(() => {
            if (snackbar.parentElement) {
                snackbar.parentElement.removeChild(snackbar);
            }
        }, 300);
    }

    // Обновляем apiCall для использования снекбаров
    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.apiUrl}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMessage = data.detail || `Ошибка ${response.status}`;
                this.showSnackbar(errorMessage, 'error');
                throw new Error(errorMessage);
            }

            return data;

        } catch (error) {
            console.error('API call failed:', error);
            // Снекбар уже показан в блоке if выше
            throw error;
        }
    }

    // Обновляем методы добавления транзакций и категорий
    async addTransaction() {
        const formData = {
            amount: parseFloat(document.getElementById('amount').value),
            category_id: parseInt(document.getElementById('categorySelect').value),
            date: document.getElementById('date').value,
            description: document.getElementById('description').value || ''
        };

        if (!formData.amount || !formData.category_id) {
            this.showSnackbar('Пожалуйста, заполните обязательные поля', 'error');
            return;
        }

        try {
            await this.apiCall('/transactions', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            // Очищаем форму
            document.getElementById('amount').value = '';
            document.getElementById('description').value = '';

            // Перезагружаем данные
            await this.loadTransactions();
            await this.loadAnalytics();

            // Показываем успешный снекбар
            this.showSnackbar('Транзакция успешно добавлена!');

        } catch (error) {
            // Ошибка уже обработана в apiCall
            console.error('Failed to add transaction:', error);
        }
    }

    async addCategory() {
        const formData = {
            name: document.getElementById('categoryName').value,
            type: document.getElementById('categoryType').value,
            color: document.getElementById('categoryColor').value
        };

        if (!formData.name) {
            this.showSnackbar('Пожалуйста, введите название категории', 'error');
            return;
        }

        try {
            await this.apiCall('/categories', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            document.getElementById('categoryName').value = '';
            await this.loadCategories();

            this.showSnackbar('Категория успешно добавлена!');

        } catch (error) {
            console.error('Failed to add category:', error);
        }
    }

}

function updateCategories() {
    app.updateCategorySelects();
}

function applyCustomDates() {
    app.loadTransactions();
    app.loadAnalytics();
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FinanceTracker();
});