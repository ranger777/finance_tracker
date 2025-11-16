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

        this.init();
    }

    async init() {
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
        document.getElementById('periodSelect').value = this.currentPeriod;
        this.toggleCustomDateRange();

        this.setupEventListeners();
        await this.loadCategories();
        await this.loadTransactions();
        await this.loadAnalytics();
        await this.loadSavingsAnalytics();
        this.updateView();
        this.renderCategoriesSettings(); // ДОБАВЛЯЕМ ЗАГРУЗКУ НАСТРОЕК
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

        // НЕ добавляем обработчики для кнопок переключения - они работают через onchange
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
        // Показываем/скрываем элементы
        const views = ['main', 'savings', 'settings', 'edit']; // ДОБАВЬТЕ 'edit' в массив
        views.forEach(viewType => {
            const elements = document.querySelectorAll(`.${viewType}-view`);
            elements.forEach(el => {
                el.style.display = viewType === this.currentView ? 'block' : 'none';
            });
        });

        // Обновляем графики если нужно
        if (this.currentView === 'main' && this.analytics) {
            this.renderCharts();
        } else if (this.currentView === 'savings' && this.savingsAnalytics) {
            this.renderSavingsCharts();
        }
        // ДОБАВЬТЕ этот блок для edit view:
        else if (this.currentView === 'edit') {
            this.loadTransactionsForEdit();
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

            // Пробуем распарсить ответ независимо от статуса
            let data;
            try {
                data = await response.json();
            } catch (e) {
                data = {detail: `Ошибка парсинга ответа: ${e.message}`};
            }

            if (!response.ok) {
                // Извлекаем сообщение об ошибке из разных возможных форматов
                const errorMessage = data.detail || data.message || data.error || `Ошибка ${response.status}`;
                this.showSnackbar(errorMessage, 'error');
                throw new Error(errorMessage);
            }

            return data;

        } catch (error) {
            console.error('API call failed:', error);

            // Если это уже наша ошибка с сообщением - пробрасываем дальше
            if (error.message && error.message !== 'Failed to fetch') {
                throw error;
            }

            // Для сетевых ошибок показываем понятное сообщение
            const errorMessage = 'Не удалось подключиться к серверу. Проверьте, запущен ли бекенд.';
            this.showSnackbar(errorMessage, 'error');
            throw new Error(errorMessage);
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

            // Очищаем форму
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

        document.getElementById('savingsIncome').textContent =
            this.formatCurrency(this.savingsAnalytics.savings_income);
        document.getElementById('savingsExpense').textContent =
            this.formatCurrency(this.savingsAnalytics.savings_expense);
        document.getElementById('savingsBalance').textContent =
            this.formatCurrency(this.savingsAnalytics.savings_balance);

        const savingsBalanceCard = document.querySelector('.stat-card.savings-balance');
        savingsBalanceCard.classList.remove('positive', 'negative');
        if (this.savingsAnalytics.savings_balance >= 0) {
            savingsBalanceCard.classList.add('positive');
        } else {
            savingsBalanceCard.classList.add('negative');
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

    // НОВЫЙ МЕТОД: Рендер настроек категорий
    renderCategoriesSettings() {
        const container = document.getElementById('categoriesSettings');
        if (!container) return;

        container.innerHTML = '';

        if (this.categories.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">Категории не найдены</p>';
            return;
        }

        // Сортируем категории: сначала по типу, потом по имени
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

            // Получаем русское название типа
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

    // НОВЫЙ МЕТОД: Обработка изменения цвета
    onColorChange(categoryId, newColor) {
        // Активируем кнопку сохранения при изменении цвета
        const saveButton = document.querySelector(`.save-color-btn[data-category-id="${categoryId}"]`);
        const currentColor = this.categories.find(cat => cat.id === categoryId)?.color;

        if (saveButton && newColor !== currentColor) {
            saveButton.disabled = false;
        } else {
            saveButton.disabled = true;
        }
    }

    // НОВЫЙ МЕТОД: Сохранение цвета категории
    async saveCategoryColor(categoryId) {
        const colorPicker = document.querySelector(`.color-picker[data-category-id="${categoryId}"]`);
        const saveButton = document.querySelector(`.save-color-btn[data-category-id="${categoryId}"]`);
        const message = document.getElementById(`message-${categoryId}`);

        if (!colorPicker || !saveButton) return;

        const newColor = colorPicker.value;

        try {
            // Отправляем запрос на обновление цвета
            await this.apiCall(`/categories/${categoryId}`, {
                method: 'PUT',
                body: JSON.stringify({color: newColor})
            });

            // Обновляем локальные данные
            const category = this.categories.find(cat => cat.id === categoryId);
            if (category) {
                category.color = newColor;
            }

            // Обновляем визуальное отображение в настройках
            const categoryItem = saveButton.closest('.category-setting-item');
            if (categoryItem) {
                categoryItem.style.borderLeftColor = newColor;
                const currentColorSpan = categoryItem.querySelector('.current-color');
                if (currentColorSpan) {
                    currentColorSpan.style.background = newColor;
                }
            }

            // Деактивируем кнопку
            saveButton.disabled = true;

            // Показываем сообщение об успехе
            if (message) {
                message.classList.add('show');
                setTimeout(() => {
                    message.classList.remove('show');
                }, 3000);
            }

            // Параллельно загружаем обновленные данные
            await Promise.all([
                this.loadCategories(),
                this.loadTransactions(),
                this.loadAnalytics(),
                this.loadSavingsAnalytics()
            ]);

            // Перерисовываем графики в зависимости от текущего вида
            if (this.currentView === 'main') {
                this.destroyCharts();
                setTimeout(() => this.renderCharts(), 150);
            } else if (this.currentView === 'savings') {
                this.destroySavingsCharts();
                setTimeout(() => this.renderSavingsCharts(), 150);
            }

            this.showSnackbar('Цвет категории успешно изменен!');

        } catch (error) {
            console.error('Failed to update category color:', error);

            // Восстанавливаем старый цвет в пикере в случае ошибки
            if (category) {
                colorPicker.value = category.color;
            }
            this.showSnackbar('Ошибка при изменении цвета категории', 'error');
        }
    }


// Добавить методы:
    switchToEditView() {
        this.currentView = 'edit';
        this.updateView();
        this.loadTransactionsForEdit();
    }

    loadTransactionsForEdit() {
        this.renderEditTransactions();
    }

    renderEditTransactions() {
        const container = document.getElementById('editTransactionsList');
        if (!container) return;

        // Пагинация
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

            const category = this.categories.find(cat => cat.id === transaction.category_id);

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

        // ВСЕГДА отправляем все поля
        const updateData = {
            amount: parseFloat(formData.get('amount')),
            category_id: parseInt(formData.get('category_id')),
            date: formData.get('date'), // всегда есть из required поля
            description: formData.get('description') || ''
        };

        // Базовая валидация
        if (!updateData.date || !updateData.amount || !updateData.category_id) {
            this.showSnackbar('Заполните все обязательные поля', 'error');
            return;
        }

        console.log('Sending update data:', updateData);

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
        if (!this.analytics) return;

        // УБЕДИТЕСЬ, ЧТО СТАРЫЕ ГРАФИКИ УНИЧТОЖАЮТСЯ ПЕРЕД СОЗДАНИЕМ НОВЫХ
        this.destroyCharts();

        // Добавьте небольшую задержку для гарантии очистки
        setTimeout(() => {
            this.renderCategoryChart();
            this.renderDailyChart();
        }, 100);
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

        // ОТЛАДКА - проверим все цвета
        console.log('Top incomes:', topIncomes.map(item => ({name: item.category_name, color: item.category_color})));
        console.log('Top expenses:', topExpenses.map(item => ({name: item.category_name, color: item.category_color})));

        // Уничтожаем старый график
        if (this.categoryChart) {
            this.categoryChart.destroy();
        }

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
                            ...Array(topExpenses.length).fill(0) // ЗАМЕНИЛИ null на 0
                        ],
                        backgroundColor: [
                            ...topIncomes.map(item => item.category_color),
                            ...Array(topExpenses.length).fill('transparent') // ПРОЗРАЧНЫЙ для расходов
                        ],
                        borderColor: [
                            ...topIncomes.map(item => this.adjustBrightness(item.category_color, -20)),
                            ...Array(topExpenses.length).fill('transparent')
                        ],
                        borderWidth: 1,
                        barPercentage: 0.6,
                        categoryPercentage: 0.8
                    },
                    {
                        label: 'Расходы',
                        data: [
                            ...Array(topIncomes.length).fill(0), // ЗАМЕНИЛИ null на 0
                            ...topExpenses.map(item => item.total)
                        ],
                        backgroundColor: [
                            ...Array(topIncomes.length).fill('transparent'), // ПРОЗРАЧНЫЙ для доходов
                            ...topExpenses.map(item => item.category_color)
                        ],
                        borderColor: [
                            ...Array(topIncomes.length).fill('transparent'),
                            ...topExpenses.map(item => this.adjustBrightness(item.category_color, -20))
                        ],
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
                        font: {size: 16}
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.raw;
                                if (value === 0) return ''; // СКРЫВАЕМ нулевые значения
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
                        grid: {color: 'rgba(0, 0, 0, 0.1)'},
                        title: {display: true, text: 'Сумма'}
                    },
                    y: {
                        grid: {display: false},
                        ticks: {font: {size: 12}}
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
                        fill: true,
                        borderWidth: 2
                    },
                    {
                        label: 'Расходы',
                        data: this.analytics.daily_totals.map(item => item.expense),
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Доходы и расходы по дням',
                        font: {size: 16}
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

        // Разделяем данные на "Из копилки" и "В копилку"
        const withdrawalsData = savingsData.filter(item => item.category_type === 'savings_income');
        const depositsData = savingsData.filter(item => item.category_type === 'savings_expense');

        // Сортируем по убыванию суммы и берем топ-8 для читаемости
        const topWithdrawals = withdrawalsData.sort((a, b) => b.total - a.total).slice(0, 8);
        const topDeposits = depositsData.sort((a, b) => b.total - a.total).slice(0, 8);

        this.savingsCategoryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [
                    ...topWithdrawals.map(item => item.category_name),
                    ...topDeposits.map(item => item.category_name)
                ],
                datasets: [
                    {
                        label: 'Из копилки',
                        data: [
                            ...topWithdrawals.map(item => item.total),
                            ...Array(topDeposits.length).fill(null)
                        ],
                        backgroundColor: topWithdrawals.map(item => item.category_color),
                        borderColor: topWithdrawals.map(item => this.adjustBrightness(item.category_color, -20)),
                        borderWidth: 1,
                        barPercentage: 0.6,
                        categoryPercentage: 0.8
                    },
                    {
                        label: 'В копилку',
                        data: [
                            ...Array(topWithdrawals.length).fill(null),
                            ...topDeposits.map(item => item.total)
                        ],
                        backgroundColor: topDeposits.map(item => item.category_color),
                        borderColor: topDeposits.map(item => this.adjustBrightness(item.category_color, -20)),
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
                        text: 'Топ операций по копилке',
                        font: {size: 16}
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
                        grid: {color: 'rgba(0, 0, 0, 0.1)'},
                        title: {display: true, text: 'Сумма'}
                    },
                    y: {
                        grid: {display: false},
                        ticks: {font: {size: 12}}
                    }
                }
            }
        });
    }

    renderSavingsDailyChart() {
        const ctx = document.getElementById('savingsDailyChart').getContext('2d');
        if (!ctx) return;

        const dailyData = this.savingsAnalytics.savings_daily_totals || [];

        this.savingsDailyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dailyData.map(item => this.formatDate(item.date)),
                datasets: [
                    {
                        label: 'Из копилки',
                        data: dailyData.map(item => item.savings_income || 0),
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2
                    },
                    {
                        label: 'В копилку',
                        data: dailyData.map(item => item.savings_expense || 0),
                        borderColor: '#27ae60',
                        backgroundColor: 'rgba(39, 174, 96, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Движение средств копилки по дням',
                        font: {size: 16}
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
    app.loadSavingsAnalytics();
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FinanceTracker();
});