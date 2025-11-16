class FinanceTracker {
    constructor() {
        this.apiUrl = 'http://localhost:8000/api';
        this.categories = [];
        this.transactions = [];
        this.analytics = null;
        this.savingsAnalytics = null;
        this.currentView = 'main';
        this.currentPeriod = localStorage.getItem('selectedPeriod') || 'month';
        this.categoryChart = null;
        this.dailyChart = null;
        this.savingsCategoryChart = null;
        this.savingsDailyChart = null;
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalTransactions = 0;
        this.authToken = localStorage.getItem('authToken');
        this.isAuthenticated = false;
        this.passwordSet = false;
        this.init();
    }

    async init() {
        console.log('Initializing Finance Tracker...');
        try {
            await this.checkAuthStatus();
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showAuthForm();
            return;
        }
        if (this.isAuthenticated) {
            await this.initializeApp();
        } else {
            this.showAuthForm();
        }
    }

    setupAuthEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const setupForm = document.getElementById('setupForm');

        if (loginForm) {
            loginForm.onsubmit = (e) => {
                e.preventDefault();
                this.login();
            };
        }

        if (setupForm) {
            setupForm.onsubmit = (e) => {
                e.preventDefault();
                this.setupPassword();
            };
        }
    }

    async checkAuthStatus() {
        try {
            const status = await this.apiCall('/auth/status', {}, false);
            this.passwordSet = status.password_set;
            if (this.authToken) {
                try {
                    const tokenData = JSON.parse(this.authToken);
                    const tokenValid = await this.apiCall('/auth/verify', {
                        method: 'POST',
                        body: JSON.stringify(tokenData)
                    }, false);
                    if (tokenValid.valid) {
                        this.isAuthenticated = true;
                        return;
                    } else {
                        this.authToken = null;
                        localStorage.removeItem('authToken');
                    }
                } catch (e) {
                    this.authToken = null;
                    localStorage.removeItem('authToken');
                }
            }
        } catch (error) {
            throw error;
        }
    }

    showAuthForm() {
    document.getElementById('mainApp').style.display = 'none';
    if (this.passwordSet) {
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('setupOverlay').style.display = 'none';
    } else {
        document.getElementById('setupOverlay').style.display = 'flex';
        document.getElementById('loginOverlay').style.display = 'none';
    }
    // ДОБАВЬТЕ ЭТУ СТРОКУ:
    this.setupAuthEventListeners();
}

    hideAuthForms() {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('setupOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
    }

    async initializeApp() {
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
        document.getElementById('periodSelect').value = this.currentPeriod;
        this.toggleCustomDateRange();
        this.setupEventListeners();
        await this.loadCategories();
        await this.loadTransactions();
        await this.loadAnalytics();
        await this.loadSavingsAnalytics();
        this.updateView();
        this.renderCategoriesSettings();
        this.hideAuthForms();
    }

    async apiCall(endpoint, options = {}, requireAuth = true) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        if (this.authToken && requireAuth) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        try {
            const response = await fetch(`${this.apiUrl}${endpoint}`, {
                headers,
                ...options
            });
            if (response.status === 401 && requireAuth) {
                this.handleAuthError();
                throw new Error('Требуется аутентификация');
            }
            let data;
            try {
                data = await response.json();
            } catch (e) {
                data = {detail: `Ошибка парсинга ответа: ${e.message}`};
            }
            if (!response.ok) {
                const errorMessage = data.detail || data.message || data.error || `Ошибка ${response.status}`;
                this.showSnackbar(errorMessage, 'error');
                throw new Error(errorMessage);
            }
            return data;
        } catch (error) {
            if (error.message === 'Failed to fetch') {
                const errorMessage = 'Не удалось подключиться к серверу';
                this.showSnackbar(errorMessage, 'error');
                throw new Error(errorMessage);
            }
            throw error;
        }
    }

    handleAuthError() {
        this.isAuthenticated = false;
        this.authToken = null;
        localStorage.removeItem('authToken');
        this.showAuthForm();
        this.showSnackbar('Сессия истекла. Пожалуйста, войдите снова.', 'error');
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

        // ОБРАБОТЧИКИ ДЛЯ ФОРМ АУТЕНТИФИКАЦИИ
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        document.getElementById('setupForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.setupPassword();
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

    async setupPassword() {
        console.log('🔐 [FRONTEND] Setup password started');

        const password = document.getElementById('setupPassword').value;
        const passwordConfirm = document.getElementById('setupPasswordConfirm').value;

        console.log('🔐 [FRONTEND] Password values:', {password, passwordConfirm});

        document.getElementById('setupError').style.display = 'none';

        if (password !== passwordConfirm) {
            console.log('❌ [FRONTEND] Passwords do not match');
            document.getElementById('setupError').textContent = 'Пароли не совпадают';
            document.getElementById('setupError').style.display = 'block';
            return;
        }

        if (password.length < 4) {
            console.log('❌ [FRONTEND] Password too short');
            document.getElementById('setupError').textContent = 'Пароль должен быть не менее 4 символов';
            document.getElementById('setupError').style.display = 'block';
            return;
        }

        try {
            console.log('🔐 [FRONTEND] Sending request to backend...');

            const response = await fetch(`${this.apiUrl}/auth/setup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    password: password,
                    password_confirm: passwordConfirm
                })
            });

            console.log('🔐 [FRONTEND] Response status:', response.status);

            const result = await response.json();
            console.log('🔐 [FRONTEND] Response data:', result);

            if (response.ok && result.success) {
                console.log('✅ [FRONTEND] Password setup successful');
                this.authToken = JSON.stringify(result.token);
                localStorage.setItem('authToken', this.authToken);
                this.isAuthenticated = true;
                this.passwordSet = true;
                document.getElementById('setupForm').reset();
                this.hideAuthForms();
                await this.initializeApp();
                this.showSnackbar('Пароль успешно установлен!');
            } else {
                const errorMessage = result.detail || 'Ошибка при установке пароля';
                console.log('❌ [FRONTEND] Password setup failed:', errorMessage);
                document.getElementById('setupError').textContent = errorMessage;
                document.getElementById('setupError').style.display = 'block';
            }
        } catch (error) {
            console.error('❌ [FRONTEND] Setup password error:', error);
            document.getElementById('setupError').textContent = error.message || 'Ошибка подключения к серверу';
            document.getElementById('setupError').style.display = 'block';
        }
    }

    async login() {
        const password = document.getElementById('password').value;
        document.getElementById('loginError').style.display = 'none';
        try {
            const result = await this.apiCall('/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    password: password
                })
            }, false);
            if (result.success) {
                this.authToken = JSON.stringify(result.token);
                localStorage.setItem('authToken', this.authToken);
                this.isAuthenticated = true;
                document.getElementById('loginForm').reset();
                await this.initializeApp();
                this.showSnackbar('Успешный вход!');
            }
        } catch (error) {
            document.getElementById('loginError').textContent = error.message;
            document.getElementById('loginError').style.display = 'block';
        }
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
        const views = ['main', 'savings', 'settings', 'edit'];
        views.forEach(viewType => {
            const elements = document.querySelectorAll(`.${viewType}-view`);
            elements.forEach(el => {
                el.style.display = viewType === this.currentView ? 'block' : 'none';
            });
        });
        if (this.currentView === 'main' && this.analytics) {
            this.renderCharts();
        } else if (this.currentView === 'savings' && this.savingsAnalytics) {
            this.renderSavingsCharts();
        } else if (this.currentView === 'edit') {
            this.loadTransactionsForEdit();
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

    updateStats() {
        if (!this.analytics) return;
        document.getElementById('totalIncome').textContent = this.formatCurrency(this.analytics.total_income);
        document.getElementById('totalExpense').textContent = this.formatCurrency(this.analytics.total_expense);
        document.getElementById('totalBalance').textContent = this.formatCurrency(this.analytics.balance);
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
        const savingsIncome = document.getElementById('savingsIncome');
        const savingsExpense = document.getElementById('savingsExpense');
        const savingsBalance = document.getElementById('savingsBalance');
        if (savingsIncome) savingsIncome.textContent = this.formatCurrency(this.savingsAnalytics.savings_income);
        if (savingsExpense) savingsExpense.textContent = this.formatCurrency(this.savingsAnalytics.savings_expense);
        if (savingsBalance) savingsBalance.textContent = this.formatCurrency(this.savingsAnalytics.savings_balance);
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

    updateCategorySelects() {
        const categorySelect = document.getElementById('categorySelect');
        if (!categorySelect) return;
        categorySelect.innerHTML = '<option value="">Выберите категорию</option>';
        const transactionType = document.getElementById('transactionType').value;
        const filteredCategories = this.categories.filter(cat => cat.type === transactionType);
        if (filteredCategories.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Нет доступных категорий. Создайте категорию в форме ниже.';
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
            document.getElementById('amount').value = '';
            document.getElementById('description').value = '';
            document.getElementById('categorySelect').selectedIndex = 0;
            await this.loadTransactions();
            await this.loadAnalytics();
            await this.loadSavingsAnalytics();
            if (this.currentView === 'edit') {
                this.loadTransactionsForEdit();
            }
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
        if (!container) return;
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

    renderCategoriesSettings() {
        const container = document.getElementById('categoriesSettings');
        if (!container) return;
        container.innerHTML = '';
        if (this.categories.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">Категории не найдены</p>';
            return;
        }
        const sortedCategories = [...this.categories].sort((a, b) => {
            if (a.type !== b.type) {
                const typeOrder = {'income': 1, 'expense': 2, 'savings_income': 3, 'savings_expense': 4};
                return typeOrder[a.type] - typeOrder[b.type];
            }
            return a.name.localeCompare(b.name);
        });
        sortedCategories.forEach(category => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-setting-item';
            categoryItem.style.borderLeftColor = category.color;
            const typeNames = {
                'income': 'Доход',
                'expense': 'Расход',
                'savings_income': 'Из копилки',
                'savings_expense': 'В копилку'
            };
            categoryItem.innerHTML = `
                <div class="category-info">
                    <span class="current-color" style="background: ${category.color}"></span>
                    <span class="category-name">${category.name}</span>
                    <span class="category-type ${category.type}">${typeNames[category.type]}</span>
                </div>
                <div class="color-picker-container">
                    <input type="color" 
                           class="color-picker" 
                           value="${category.color}" 
                           data-category-id="${category.id}"
                           onchange="app.onColorChange(${category.id}, this.value)">
                    <button class="save-color-btn" 
                            data-category-id="${category.id}"
                            onclick="app.saveCategoryColor(${category.id})"
                            disabled>
                        Сохранить
                    </button>
                </div>
                <div class="color-change-message" id="message-${category.id}">
                    Цвет сохранен!
                </div>
            `;
            container.appendChild(categoryItem);
        });
    }

    onColorChange(categoryId, newColor) {
        const saveButton = document.querySelector(`.save-color-btn[data-category-id="${categoryId}"]`);
        const currentColor = this.categories.find(cat => cat.id === categoryId)?.color;
        if (saveButton && newColor !== currentColor) {
            saveButton.disabled = false;
        } else {
            saveButton.disabled = true;
        }
    }

    async saveCategoryColor(categoryId) {
        const colorPicker = document.querySelector(`.color-picker[data-category-id="${categoryId}"]`);
        const saveButton = document.querySelector(`.save-color-btn[data-category-id="${categoryId}"]`);
        const message = document.getElementById(`message-${categoryId}`);
        if (!colorPicker || !saveButton) return;
        const newColor = colorPicker.value;
        try {
            await this.apiCall(`/categories/${categoryId}`, {
                method: 'PUT',
                body: JSON.stringify({color: newColor})
            });
            const category = this.categories.find(cat => cat.id === categoryId);
            if (category) {
                category.color = newColor;
            }
            const categoryItem = saveButton.closest('.category-setting-item');
            if (categoryItem) {
                categoryItem.style.borderLeftColor = newColor;
                const currentColorSpan = categoryItem.querySelector('.current-color');
                if (currentColorSpan) {
                    currentColorSpan.style.background = newColor;
                }
            }
            saveButton.disabled = true;
            if (message) {
                message.classList.add('show');
                setTimeout(() => {
                    message.classList.remove('show');
                }, 3000);
            }
            this.showSnackbar('Цвет категории успешно изменен!');
        } catch (error) {
            console.error('Failed to update category color:', error);
            this.showSnackbar('Ошибка при изменении цвета категории', 'error');
        }
    }

    loadTransactionsForEdit() {
        this.renderEditTransactions();
    }

    renderEditTransactions() {
        const container = document.getElementById('editTransactionsList');
        if (!container) return;
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageTransactions = this.transactions.slice(startIndex, endIndex);
        this.totalTransactions = this.transactions.length;
        container.innerHTML = '';
        if (pageTransactions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">Транзакций нет</p>';
            return;
        }
        pageTransactions.forEach(transaction => {
            const transactionDiv = document.createElement('div');
            transactionDiv.className = `edit-transaction-item ${transaction.category_type}`;
            transactionDiv.style.borderLeftColor = transaction.category_color;
            transactionDiv.innerHTML = `
            <form class="edit-transaction-form" data-transaction-id="${transaction.id}">
                <div class="edit-form-group">
                    <label>Дата</label>
                    <input type="date" name="date" value="${transaction.date}" required>
                </div>
                <div class="edit-form-group">
                    <label>Тип</label>
                    <select name="type" onchange="app.updateEditCategories(${transaction.id})" required>
                        <option value="income" ${transaction.category_type === 'income' ? 'selected' : ''}>Доход</option>
                        <option value="expense" ${transaction.category_type === 'expense' ? 'selected' : ''}>Расход</option>
                        <option value="savings_income" ${transaction.category_type === 'savings_income' ? 'selected' : ''}>Из копилки</option>
                        <option value="savings_expense" ${transaction.category_type === 'savings_expense' ? 'selected' : ''}>В копилку</option>
                    </select>
                </div>
                <div class="edit-form-group">
                    <label>Категория</label>
                    <select name="category_id" required>
                        ${this.getCategoryOptions(transaction.category_type, transaction.category_id)}
                    </select>
                </div>
                <div class="edit-form-group">
                    <label>Сумма</label>
                    <input type="number" name="amount" step="0.01" min="0" value="${transaction.amount}" required>
                </div>
                <div class="edit-form-group">
                    <label>Описание</label>
                    <input type="text" name="description" value="${transaction.description || ''}">
                </div>
                <div class="transaction-actions">
                    <button type="button" class="save-btn" onclick="app.saveTransaction(${transaction.id})">💾</button>
                    <button type="button" class="delete-btn" onclick="app.deleteTransaction(${transaction.id})">🗑️</button>
                </div>
            </form>
        `;
            container.appendChild(transactionDiv);
        });
        this.updatePagination();
    }

    getCategoryOptions(type, selectedId) {
        const filteredCategories = this.categories.filter(cat => cat.type === type);
        return filteredCategories.map(cat =>
            `<option value="${cat.id}" ${cat.id === selectedId ? 'selected' : ''}>${cat.name}</option>`
        ).join('');
    }

    updateEditCategories(transactionId) {
        const form = document.querySelector(`[data-transaction-id="${transactionId}"]`);
        const typeSelect = form.querySelector('select[name="type"]');
        const categorySelect = form.querySelector('select[name="category_id"]');
        const selectedType = typeSelect.value;
        categorySelect.innerHTML = this.getCategoryOptions(selectedType);
    }

    async saveTransaction(transactionId) {
        const form = document.querySelector(`[data-transaction-id="${transactionId}"]`);
        const formData = new FormData(form);
        const updateData = {
            amount: parseFloat(formData.get('amount')),
            category_id: parseInt(formData.get('category_id')),
            date: formData.get('date'),
            description: formData.get('description') || ''
        };
        if (!updateData.date || !updateData.amount || !updateData.category_id) {
            this.showSnackbar('Заполните все обязательные поля', 'error');
            return;
        }
        try {
            await this.apiCall(`/transactions/${transactionId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            await this.loadTransactions();
            await this.loadAnalytics();
            await this.loadSavingsAnalytics();
            this.loadTransactionsForEdit();
            this.showSnackbar('Транзакция успешно обновлена!');
        } catch (error) {
            console.error('Failed to update transaction:', error);
        }
    }

    async deleteTransaction(transactionId) {
        if (!confirm('Вы уверены, что хотите удалить эту транзакцию?')) {
            return;
        }
        try {
            await this.apiCall(`/transactions/${transactionId}`, {
                method: 'DELETE'
            });
            await this.loadTransactions();
            await this.loadAnalytics();
            await this.loadSavingsAnalytics();
            this.loadTransactionsForEdit();
            this.showSnackbar('Транзакция успешно удалена!');
        } catch (error) {
            console.error('Failed to delete transaction:', error);
        }
    }

    updatePagination() {
        const totalPages = Math.ceil(this.totalTransactions / this.pageSize);
        document.getElementById('pageInfo').textContent = `Страница ${this.currentPage} из ${totalPages}`;
        document.getElementById('prevPage').disabled = this.currentPage <= 1;
        document.getElementById('nextPage').disabled = this.currentPage >= totalPages;
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadTransactionsForEdit();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.totalTransactions / this.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.loadTransactionsForEdit();
        }
    }

    changePageSize() {
        const newSize = parseInt(document.getElementById('pageSize').value);
        this.pageSize = newSize;
        this.currentPage = 1;
        this.loadTransactionsForEdit();
    }

    renderCharts() {
        console.log('Charts rendering not implemented');
    }

    renderSavingsCharts() {
        console.log('Savings charts rendering not implemented');
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

// Глобальные функции
function switchView(view) {
    app.switchView(view);
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

// Тестовая функция
window.testPasswordSetup = async function () {
    const testData = {
        password: "test123",
        password_confirm: "test123"
    };
    try {
        const response = await fetch('/api/auth/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });
        const result = await response.json();
        if (response.ok && result.success) {
            localStorage.setItem('authToken', JSON.stringify(result.token));
            window.location.reload();
        }
    } catch (error) {
        console.error('Test setup error:', error);
    }
};