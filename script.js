const CART_KEY = 'melodiya-cart';
const currency = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 0
});

function readCart() {
    const savedCart = localStorage.getItem(CART_KEY);
    if (!savedCart) return {};

    const parsedCart = JSON.parse(savedCart);
    if (!parsedCart || typeof parsedCart !== 'object' || Array.isArray(parsedCart)) {
        throw new Error('Некоректний формат кошика у сховищі браузера.');
    }

    return Object.fromEntries(
        Object.entries(parsedCart).filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
    );
}

function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount(cart);
}

function updateCartCount(cart) {
    const count = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
    document.querySelectorAll('[data-cart-count]').forEach((element) => {
        element.textContent = String(count);
    });
}

function showStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', isError);
    element.hidden = false;
}

async function loadProducts() {
    const response = await fetch('store_db.json');
    if (!response.ok) {
        throw new Error(`Не вдалося завантажити каталог (HTTP ${response.status}).`);
    }
    return response.json();
}

function renderCatalog(products) {
    const grid = document.querySelector('#product-grid');
    if (!grid) return;

    const search = document.querySelector('#product-search');
    const filters = document.querySelector('#category-filters');
    const sort = document.querySelector('#product-sort');
    const status = document.querySelector('#catalog-status');
    let activeCategory = 'Усі';
    const categories = ['Усі', ...new Set(products.map((product) => product.category))];

    filters.innerHTML = categories.map((category) => `
        <button class="filter-chip${category === activeCategory ? ' is-active' : ''}"
            type="button" data-category="${category}" aria-pressed="${category === activeCategory}">
            ${category}
        </button>
    `).join('');

    function updateProducts() {
        const query = search.value.trim().toLocaleLowerCase('uk');
        let visibleProducts = products.filter((product) => {
            const matchesCategory = activeCategory === 'Усі' || product.category === activeCategory;
            const matchesSearch = `${product.title} ${product.category} ${product.description}`
                .toLocaleLowerCase('uk').includes(query);
            return matchesCategory && matchesSearch;
        });

        if (sort.value === 'price-asc') visibleProducts.sort((a, b) => a.price - b.price);
        if (sort.value === 'price-desc') visibleProducts.sort((a, b) => b.price - a.price);
        if (sort.value === 'name') visibleProducts.sort((a, b) => a.title.localeCompare(b.title, 'uk'));

        grid.innerHTML = visibleProducts.map((product) => `
            <article class="product-card">
                <div class="product-art" aria-hidden="true">
                    <span class="product-icon">${product.image}</span>
                    <span class="product-category">${product.category}</span>
                </div>
                <div class="product-info">
                    <h3>${product.title}</h3>
                    <p>${product.description}</p>
                    <div class="product-bottom">
                        <strong>${currency.format(product.price)}</strong>
                        <button class="add-button" type="button" data-add-to-cart="${product.id}"
                            aria-label="Додати ${product.title} до кошика">+</button>
                    </div>
                </div>
            </article>
        `).join('');

        if (visibleProducts.length === 0) {
            showStatus(status, 'За вашим запитом нічого не знайдено.');
        } else {
            status.hidden = true;
        }
    }

    filters.addEventListener('click', (event) => {
        const button = event.target.closest('[data-category]');
        if (!button) return;
        activeCategory = button.dataset.category;
        filters.querySelectorAll('.filter-chip').forEach((chip) => {
            const isActive = chip === button;
            chip.classList.toggle('is-active', isActive);
            chip.setAttribute('aria-pressed', String(isActive));
        });
        updateProducts();
    });
    search.addEventListener('input', updateProducts);
    sort.addEventListener('change', updateProducts);
    grid.addEventListener('click', (event) => {
        const button = event.target.closest('[data-add-to-cart]');
        if (!button) return;
        const cart = readCart();
        const productId = button.dataset.addToCart;
        cart[productId] = (cart[productId] || 0) + 1;
        saveCart(cart);
        button.textContent = '✓';
        window.setTimeout(() => { button.textContent = '+'; }, 900);
    });

    updateProducts();
}

function renderCart(products) {
    const itemsElement = document.querySelector('#cart-items');
    if (!itemsElement) return;

    const cart = readCart();
    const status = document.querySelector('#cart-status');
    const productById = new Map(products.map((product) => [String(product.id), product]));
    const validCart = Object.fromEntries(
        Object.entries(cart).filter(([id]) => productById.has(id))
    );

    if (Object.keys(validCart).length !== Object.keys(cart).length) saveCart(validCart);

    const entries = Object.entries(validCart);
    itemsElement.innerHTML = entries.length ? entries.map(([id, quantity]) => {
        const product = productById.get(id);
        return `
            <article class="cart-item">
                <div class="cart-item-art" aria-hidden="true">${product.image}</div>
                <div class="cart-item-details">
                    <span class="product-category">${product.category}</span>
                    <h2>${product.title}</h2>
                    <strong>${currency.format(product.price)}</strong>
                </div>
                <div class="quantity-control" aria-label="Кількість: ${quantity}">
                    <button type="button" data-quantity="${id}" data-change="-1" aria-label="Зменшити кількість">−</button>
                    <span>${quantity}</span>
                    <button type="button" data-quantity="${id}" data-change="1" aria-label="Збільшити кількість">+</button>
                </div>
                <button class="remove-button" type="button" data-remove="${id}">Видалити</button>
            </article>
        `;
    }).join('') : `
        <div class="empty-cart">
            <span aria-hidden="true">♫</span>
            <h2>Кошик поки порожній</h2>
            <p>Саме час знайти інструмент, який надихне на нові мелодії.</p>
            <a class="button button-dark" href="index.html#catalog">До каталогу <span aria-hidden="true">→</span></a>
        </div>
    `;

    const total = entries.reduce((sum, [id, quantity]) => {
        return sum + productById.get(id).price * quantity;
    }, 0);
    document.querySelector('#cart-subtotal').textContent = currency.format(total);
    document.querySelector('#cart-total').textContent = currency.format(total);
    document.querySelector('#checkout-button').disabled = entries.length === 0;

    if (itemsElement.dataset.listenerAttached !== 'true') {
        itemsElement.dataset.listenerAttached = 'true';
        itemsElement.addEventListener('click', (event) => {
            const removeButton = event.target.closest('[data-remove]');
            const quantityButton = event.target.closest('[data-quantity]');
            const updatedCart = readCart();

            if (removeButton) {
                delete updatedCart[removeButton.dataset.remove];
            } else if (quantityButton) {
                const id = quantityButton.dataset.quantity;
                updatedCart[id] += Number(quantityButton.dataset.change);
                if (updatedCart[id] <= 0) delete updatedCart[id];
            } else {
                return;
            }

            saveCart(updatedCart);
            renderCart(products);
        });
    }

    const checkoutButton = document.querySelector('#checkout-button');
    if (checkoutButton.dataset.listenerAttached !== 'true') {
        checkoutButton.dataset.listenerAttached = 'true';
        checkoutButton.addEventListener('click', () => {
            const checkoutForm = document.querySelector('#checkout-form');
            checkoutForm.hidden = false;
            checkoutButton.hidden = true;
            checkoutForm.querySelector('input').focus();
        });
    }

    const checkoutForm = document.querySelector('#checkout-form');
    if (checkoutForm.dataset.listenerAttached !== 'true') {
        checkoutForm.dataset.listenerAttached = 'true';
        checkoutForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const currentCart = readCart();
            const currentEntries = Object.entries(currentCart).filter(([id]) => productById.has(id));
            if (currentEntries.length === 0) {
                showStatus(status, 'Кошик порожній — додайте товари перед оформленням.', true);
                return;
            }

            const formData = new FormData(checkoutForm);
            const customerName = formData.get('name').trim();
            const orderId = `DEMO-${Date.now().toString().slice(-6)}`;
            const orderTotal = currentEntries.reduce((sum, [id, quantity]) => {
                return sum + productById.get(id).price * quantity;
            }, 0);

            document.querySelector('#success-name').textContent = customerName;
            document.querySelector('#success-message').textContent =
                `Демо-замовлення ${orderId} на суму ${currency.format(orderTotal)} створено.`;
            document.querySelector('#checkout-success').hidden = false;
            document.querySelector('.cart-layout').hidden = true;
            saveCart({});
        });
    }

    const cancelButton = document.querySelector('#checkout-cancel');
    if (cancelButton.dataset.listenerAttached !== 'true') {
        cancelButton.dataset.listenerAttached = 'true';
        cancelButton.addEventListener('click', () => {
            checkoutForm.reset();
            checkoutForm.hidden = true;
            checkoutButton.hidden = false;
        });
    }
}

async function initializeStore() {
    const status = document.querySelector('#catalog-status') || document.querySelector('#cart-status');
    try {
        const cart = readCart();
        updateCartCount(cart);
        const products = await loadProducts();
        renderCatalog(products);
        renderCart(products);
    } catch (error) {
        console.error('Не вдалося запустити магазин:', error);
        showStatus(status, 'Не вдалося завантажити магазин. Запустіть локальний вебсервер і оновіть сторінку.', true);
    }
}

initializeStore();
