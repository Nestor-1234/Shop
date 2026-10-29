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

function renderProductCartActions(product, quantity) {
    if (quantity > 0) {
        return `
            <div class="product-cart-actions is-added" data-product-cart-actions="${product.id}"
                aria-live="polite" aria-atomic="true">
                <span class="added-label">Додано ✓</span>
                <div class="quantity-control" aria-label="Кількість ${product.title}: ${quantity}">
                    <button class="quantity-button" type="button" data-cart-change="${product.id}"
                        data-change="-1" aria-label="Зменшити кількість ${product.title}">−</button>
                    <span data-product-quantity>${quantity}</span>
                    <button class="quantity-button" type="button" data-cart-change="${product.id}"
                        data-change="1" aria-label="Збільшити кількість ${product.title}">+</button>
                </div>
            </div>
        `;
    }

    return `
        <div class="product-cart-actions" data-product-cart-actions="${product.id}">
            <button class="add-button" type="button" data-add-to-cart="${product.id}"
                aria-label="Додати ${product.title} до кошика">Додати в кошик</button>
        </div>
    `;
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
    const productDialog = document.querySelector('#product-dialog');
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

        const cart = readCart();
        grid.innerHTML = visibleProducts.map((product) => `
            <article class="product-card" data-product-card="${product.id}">
                <div class="product-image">
                    <button class="product-image-button" type="button" data-product-details="${product.id}"
                        aria-label="Переглянути фото й опис ${product.title}">
                        <img src="${product.image}" alt="${product.title}" loading="lazy">
                    </button>
                    <span class="product-category">${product.category}</span>
                </div>
                <div class="product-info">
                    <h3 class="product-name">${product.title}</h3>
                    <p class="product-description">${product.description}</p>
                    <div class="product-bottom">
                        <strong class="product-price">${currency.format(product.price)}</strong>
                        ${renderProductCartActions(product, cart[product.id] || 0)}
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
        const quantityButton = event.target.closest('[data-cart-change]');
        const addButton = event.target.closest('[data-add-to-cart]');
        if (quantityButton || addButton) {
            const productId = quantityButton
                ? quantityButton.dataset.cartChange
                : addButton.dataset.addToCart;
            const product = products.find((item) => String(item.id) === productId);
            if (!product) return;

            const cart = readCart();
            const nextQuantity = (cart[productId] || 0) + (
                quantityButton ? Number(quantityButton.dataset.change) : 1
            );
            if (nextQuantity > 0) {
                cart[productId] = nextQuantity;
            } else {
                delete cart[productId];
            }

            saveCart(cart);
            grid.querySelector(`[data-product-cart-actions="${productId}"]`).outerHTML =
                renderProductCartActions(product, nextQuantity);
            return;
        }

        const detailsButton = event.target.closest('[data-product-details]');
        if (detailsButton) {
            const product = products.find((item) => String(item.id) === detailsButton.dataset.productDetails);
            if (!product) return;

            const dialogImage = productDialog.querySelector('#product-dialog-image');
            dialogImage.src = product.image;
            dialogImage.alt = product.title;
            productDialog.querySelector('#product-dialog-category').textContent = product.category;
            productDialog.querySelector('#product-dialog-title').textContent = product.title;
            productDialog.querySelector('#product-dialog-description').textContent = product.description;
            productDialog.querySelector('#product-dialog-details').textContent = product.details;
            productDialog.querySelector('#product-dialog-price').textContent = currency.format(product.price);
            productDialog.showModal();
            return;
        }
    });

    productDialog.querySelector('.product-dialog-close').addEventListener('click', () => {
        productDialog.close();
    });
    productDialog.addEventListener('click', (event) => {
        if (event.target === productDialog) productDialog.close();
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
                <div class="cart-item-art" aria-hidden="true">
                    <img src="${product.image}" alt="" loading="lazy">
                </div>
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

    itemsElement.onclick = (event) => {
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
    };

    const checkoutButton = document.querySelector('#checkout-button');
    const checkoutForm = document.querySelector('#checkout-form');
    const cancelButton = document.querySelector('#checkout-cancel');

    checkoutButton.onclick = () => {
        checkoutForm.hidden = false;
        checkoutButton.hidden = true;
    };

    checkoutForm.onsubmit = (event) => {
        event.preventDefault();

        if (entries.length === 0) {
            showStatus(status, 'Кошик порожній — додайте товари перед оформленням.', true);
            return;
        }

        const customerName = checkoutForm.elements.name.value.trim();
        document.querySelector('#success-name').textContent = customerName;
        document.querySelector('#success-message').textContent =
            `Ваше замовлення на суму ${currency.format(total)} оформлено.`;
        document.querySelector('#checkout-success').hidden = false;
        document.querySelector('.cart-layout').hidden = true;
        saveCart({});
    };

    cancelButton.onclick = () => {
        checkoutForm.reset();
        checkoutForm.hidden = true;
        checkoutButton.hidden = false;
    };
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
