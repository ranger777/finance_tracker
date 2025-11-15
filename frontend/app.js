class FinanceTracker {
    constructor() {
        this.apiUrl = 'http://localhost:8000/api';
        this.categories = [];
        this.transactions = [];
        this.analytics = null;
        this.savingsAnalytics = null;
        this.currentView = 'main'; // 'main' или 'savings'

        this.currentPeriod = localStorage.getItem('selectedPeriod') || 'month';
        this.categoryChart = null;
        this.dailyChart = null;
        this.savingsCategoryChart = null;
        this.savingsDailyChart = null;

        this.init();
    }

    async init() {
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
        document.getElementById('periodSelect').value = this.currentPeriod;
        this.toggleCustomDateRange();

        this.setupEventListeners();
        await this.loadCategories();
        // Проверяем наличие категорий для копилки
        await this.ensureSavingsCategories();
        await this.loadTransactions();
        await this.loadAnalytics();
        await this.loadSavingsAnalytics();
        this.updateView();
    }

    async ensureSavingsCategories() {
    const savingsCategories = this.categories.filter(cat =>
        cat.type === 'savings_income' || cat.type === 'savings_expense'
    );

    if (savingsCategories.length === 0) {
        console.log('Категории для копилки не найдены, создаем автоматически...');
        // Можно добавить автоматическое создание категорий или показать подсказку
    }
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
            localStorage.setItem('selectedPeriod', this.currentPeriod);
            this.toggleCustomDateRange();
            this.loadTransactions();
            this.loadAnalytics();
            this.loadSavingsAnalytics();
        });
    }

    toggleCustomDateRange() {
        const customRange = document.getElementById('customDateRange');
        if (this.currentPeriod === 'custom') {
            customRange.style.display = 'flex';

            const today = new Date();
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');

            if (!startDateInput.value) {
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

    switchView(view) {
        this.currentView = view;
        this.updateView();
    }

    updateView() {
        // Показываем/скрываем элементы основной статистики
        const mainElements = document.querySelectorAll('.main-view');
        const savingsElements = document.querySelectorAll('.savings-view');

        if (this.currentView === 'main') {
            mainElements.forEach(el => el.style.display = 'block');
            savingsElements.forEach(el => el.style.display = 'none');
            this.renderCharts();
        } else {
            mainElements.forEach(el => el.style.display = 'none');
            savingsElements.forEach(el => el.style.display = 'block');
            this.renderSavingsCharts();
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
                const errorMessage = data.detail || `Ошибка ${response.status}`;
                this.showSnackbar(errorMessage, 'error');
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
            let url = `/transactions?period=${this.currentPeriod}&include_savings=true`;

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
                group_by: 'category',
                include_savings: false
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
            if (this.currentView === 'main') {
                this.renderCharts();
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
        }
    }

    async loadSavingsAnalytics() {
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

        this.savingsAnalytics = await this.apiCall('/analytics/savings', {
            method: 'POST',
            body: JSON.stringify(request)
        });

        this.updateSavingsStats();
        this.renderSavingsCategoryAnalytics();
        if (this.currentView === 'savings') {
            this.renderSavingsCharts();
        }
    } catch (error) {
        console.error('Failed to load savings analytics:', error);
    }
}

    updateCategorySelects() {
    const categorySelect = document.getElementById('categorySelect');
    categorySelect.innerHTML = '<option value="">Выберите категорию</option>';

    const transactionType = document.getElementById('transactionType').value;

    // Фильтруем категории по выбранному типу
    const filteredCategories = this.categories.filter(cat => cat.type === transactionType);

    if (filteredCategories.length === 0) {
        // Если нет категорий для выбранного типа, показываем сообщение
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Сначала создайте категорию для этого типа';
        option.disabled = true;
        option.selected = true;
        categorySelect.appendChild(option);
    } else {
        filteredCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            option.dataset.type = category.type;
            categorySelect.appendChild(option);
        });
    }
}

async addTransaction() {
    const categoryId = document.getElementById('categorySelect').value;
    const amount = document.getElementById('amount').value;

    if (!amount || !categoryId) {
        this.showSnackbar('Пожалуйста, заполните сумму и выберите категорию', 'error');
        return;
    }

    const formData = {
        amount: parseFloat(amount),
        category_id: parseInt(categoryId),
        date: document.getElementById('date').value,
        description: document.getElementById('description').value || ''
    };

    try {
        await this.apiCall('/transactions', {
            method: 'POST',
            body: JSON.stringify(formData)
        });

        // Очищаем форму
        document.getElementById('amount').value = '';
        document.getElementById('description').value = '';
        document.getElementById('categorySelect').selectedIndex = 0;

        await this.loadTransactions();
        await this.loadAnalytics();
        await this.loadSavingsAnalytics();

        this.showSnackbar('Транзакция успешно добавлена!');
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

    updateSavingsStats() {
    if (!this.savingsAnalytics) return;

    // Теперь логика правильная:
    // savings_expense = В копилку (пополнения) - положительное число
    // savings_income = Из копилки (снятия) - положительное число
    // savings_balance = (В копилку) - (Из копилки)

    document.getElementById('savingsIncome').textContent =
        this.formatCurrency(this.savingsAnalytics.savings_income);  // Из копилки
    document.getElementById('savingsExpense').textContent =
        this.formatCurrency(this.savingsAnalytics.savings_expense); // В копилку
    document.getElementById('savingsBalance').textContent =
        this.formatCurrency(this.savingsAnalytics.savings_balance); // Баланс

    const savingsBalanceCard = document.querySelector('.stat-card.savings-balance');
    if (savingsBalanceCard) {
        savingsBalanceCard.classList.remove('positive', 'negative');
        if (this.savingsAnalytics.savings_balance >= 0) {
            savingsBalanceCard.classList.add('positive');
        } else {
            savingsBalanceCard.classList.add('negative');
        }
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

    renderSavingsCategoryAnalytics() {
        if (!this.savingsAnalytics) return;

        const container = document.getElementById('savingsCategoryAnalytics');
        if (!container) return;

        container.innerHTML = '';

        // Фильтруем только категории копилки
        const savingsCategories = this.savingsAnalytics.by_category.filter(
            item => item.category_type === 'savings_income' || item.category_type === 'savings_expense'
        );

        savingsCategories.forEach(item => {
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

        this.destroyCharts();
        this.renderCategoryChart();
        this.renderDailyChart();
    }

    renderSavingsCharts() {
        if (!this.savingsAnalytics) return;

        this.destroySavingsCharts();
        this.renderSavingsCategoryChart();
        this.renderSavingsDailyChart();
    }

    destroyCharts() {
        if (this.categoryChart) {
            this.categoryChart.destroy();
            this.categoryChart = null;
        }
        if (this.dailyChart) {
            this.dailyChart.destroy();
            this.dailyChart = null;
        }
    }

    destroySavingsCharts() {
        if (this.savingsCategoryChart) {
            this.savingsCategoryChart.destroy();
            this.savingsCategoryChart = null;
        }
        if (this.savingsDailyChart) {
            this.savingsDailyChart.destroy();
            this.savingsDailyChart = null;
        }
    }

    renderCategoryChart() {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        if (!ctx) return;

        const incomeData = this.analytics.by_category.filter(item => item.category_type === 'income');
        const expenseData = this.analytics.by_category.filter(item => item.category_type === 'expense');

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
                            ...Array(topExpenses.length).fill(null)
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
                            ...Array(topIncomes.length).fill(null),
                            ...topExpenses.map(item => item.total)
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
                indexAxis: 'y',
                plugins: {
                    title: {
                        display: true,
                        text: 'Топ доходов и расходов по категориям',
                        font: { size: 16 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.raw;
                                if (value === null) return '';
                                return `${context.dataset.label}: ${this.formatCurrency(value)}`;
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
                            callback: (value) => this.formatCurrency(value)
                        },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' },
                        title: { display: true, text: 'Сумма' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 12 } }
                    }
                }
            }
        });
    }

    renderDailyChart() {
        const ctx = document.getElementById('dailyChart').getContext('2d');
        if (!ctx) return;

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
                            callback: (value) => this.formatCurrency(value)
                        }
                    }
                }
            }
        });
    }

    renderSavingsCategoryChart() {
        const ctx = document.getElementById('savingsCategoryChart').getContext('2d');
        if (!ctx) return;

        const savingsData = this.savingsAnalytics.by_category.filter(
            item => item.category_type === 'savings_income' || item.category_type === 'savings_expense'
        );

        this.savingsCategoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: savingsData.map(item => item.category_name),
                datasets: [{
                    data: savingsData.map(item => item.total),
                    backgroundColor: savingsData.map(item => item.category_color),
                    borderColor: savingsData.map(item => this.adjustBrightness(item.category_color, -20)),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Распределение по копилке'
                    },
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.label}: ${this.formatCurrency(context.raw)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    renderSavingsDailyChart() {
        const ctx = document.getElementById('savingsDailyChart').getContext('2d');
        if (!ctx) return;

        this.savingsDailyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.savingsAnalytics.daily_totals.map(item => this.formatDate(item.date)),
                datasets: [
                    {
                        label: 'Из копилки',
                        data: this.savingsAnalytics.daily_totals.map(item => item.income),
                        borderColor: '#8e44ad',
                        backgroundColor: 'rgba(142, 68, 173, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'В копилку',
                        data: this.savingsAnalytics.daily_totals.map(item => item.expense),
                        borderColor: '#9b59b6',
                        backgroundColor: 'rgba(155, 89, 182, 0.1)',
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
                        text: 'Движение средств копилки по дням'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => this.formatCurrency(value)
                        }
                    }
                }
            }
        });
    }

    adjustBrightness(hex, percent) {
        return hex;
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
        const snackbar = document.createElement('div');
        snackbar.className = `snackbar ${type}`;

        const progressBar = type === 'success' ? '<div class="snackbar-progress"></div>' : '';

        snackbar.innerHTML = `
            <div class="snackbar-content">${message}</div>
            ${type === 'error' ? '<button class="snackbar-close">OK</button>' : ''}
            ${progressBar}
        `;

        document.body.appendChild(snackbar);

        setTimeout(() => {
            snackbar.classList.add('show');
        }, 100);

        if (type === 'error') {
            const closeBtn = snackbar.querySelector('.snackbar-close');
            closeBtn.addEventListener('click', () => {
                this.hideSnackbar(snackbar);
            });
        } else {
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
}

function updateCategories() {
    app.updateCategorySelects();
}

function applyCustomDates() {
    app.loadTransactions();
    app.loadAnalytics();
    app.loadSavingsAnalytics();
}

function switchView(view) {
    app.switchView(view);
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FinanceTracker();
});