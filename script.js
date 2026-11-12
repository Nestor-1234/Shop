const CART_KEY = 'melodiya-cart';
const FAVORITES_KEY = 'melodiya-favorites';
const LANGUAGE_KEY = 'melodiya-language';
const FAVORITES_FILTER = 'Обране';
const i18n = window.storeI18n;
let currentLanguage = 'uk';

function translate(key, values = {}) {
    let message = i18n.messages[currentLanguage][key] || i18n.messages.uk[key] || key;
    Object.entries(values).forEach(([name, value]) => {
        message = message.replaceAll(`{${name}}`, value);
    });
    return message;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat(i18n.languages[currentLanguage].locale, {
        style: 'currency',
        currency: 'UAH',
        maximumFractionDigits: 0
    }).format(amount);
}

function categoryKey(category) {
    const categoryKeys = {
        'Усі': 'all',
        [FAVORITES_FILTER]: 'favorites',
        'Гітари': 'guitars',
        'Бас-гітари': 'guitars',
        'Клавішні': 'keyboards',
        'Ударні': 'drums',
        'Аксесуари': 'accessories'
    };
    return categoryKeys[category];
}

function canonicalCategory(category) {
    return category === 'Бас-гітари' ? 'Гітари' : category;
}

function localizeCategory(category) {
    const key = categoryKey(category);
    return key ? i18n.categories[currentLanguage][key] : category;
}

function localizeProduct(product) {
    const copy = i18n.products[currentLanguage]?.[product.id];
    return {
        ...product,
        title: copy?.[3] || product.title,
        category: copy?.[0] || localizeCategory(canonicalCategory(product.category)),
        description: copy?.[1] || product.description,
        details: copy?.[2] || product.details
    };
}

function initializeLanguage() {
    const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
    currentLanguage = Object.hasOwn(i18n.languages, savedLanguage) ? savedLanguage : 'uk';
    document.documentElement.lang = currentLanguage === 'zh'
        ? 'zh-CN'
        : currentLanguage === 'hi'
            ? 'hi-IN'
            : currentLanguage;
    document.documentElement.dir = 'ltr';

    document.querySelectorAll('[data-i18n]').forEach((element) => {
        element.textContent = translate(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach((element) => {
        element.innerHTML = translate(element.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
        element.placeholder = translate(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-content]').forEach((element) => {
        element.content = translate(element.dataset.i18nContent);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
        element.setAttribute('aria-label', translate(element.dataset.i18nAriaLabel));
    });

    const selector = document.querySelector('[data-language-select]');
    if (selector) {
        selector.value = currentLanguage;
        selector.addEventListener('change', () => {
            localStorage.setItem(LANGUAGE_KEY, selector.value);
            window.location.reload();
        });
    }
}

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

function readFavorites() {
    const savedFavorites = localStorage.getItem(FAVORITES_KEY);
    if (!savedFavorites) return [];

    const parsedFavorites = JSON.parse(savedFavorites);
    if (!Array.isArray(parsedFavorites) ||
        !parsedFavorites.every((id) => typeof id === 'string' || typeof id === 'number')) {
        throw new Error('Некоректний формат обраного у сховищі браузера.');
    }

    return [...new Set(parsedFavorites.map(String))];
}

function saveFavorites(favorites) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function updateCartCount(cart) {
    const count = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
    document.querySelectorAll('[data-cart-count]').forEach((element) => {
        element.textContent = String(count);
    });
}

function renderProductCartActions(product, quantity) {
    const localizedProduct = localizeProduct(product);
    if (quantity > 0) {
        return `
            <div class="product-cart-actions is-added" data-product-cart-actions="${product.id}"
                aria-live="polite" aria-atomic="true">
                <span class="added-label">${translate('added')}</span>
                <div class="quantity-control" aria-label="${translate('quantity')} ${localizedProduct.title}: ${quantity}">
                    <button class="quantity-button" type="button" data-cart-change="${product.id}"
                        data-change="-1" aria-label="${translate('decreaseQuantity')} ${localizedProduct.title}">−</button>
                    <span data-product-quantity>${quantity}</span>
                    <button class="quantity-button" type="button" data-cart-change="${product.id}"
                        data-change="1" aria-label="${translate('increaseQuantity')} ${localizedProduct.title}">+</button>
                </div>
            </div>
        `;
    }

    return `
        <div class="product-cart-actions" data-product-cart-actions="${product.id}">
            <button class="add-button" type="button" data-add-to-cart="${product.id}"
                aria-label="${translate('addToCart')}: ${localizedProduct.title}">${translate('addToCart')}</button>
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
    const categories = [
        'Усі',
        ...new Set(products.map((product) => canonicalCategory(product.category))),
        FAVORITES_FILTER
    ];

    filters.innerHTML = categories.map((category) => `
        <button class="filter-chip${category === activeCategory ? ' is-active' : ''}"
            type="button" data-category="${category}" aria-pressed="${category === activeCategory}">
            ${localizeCategory(category)}
        </button>
    `).join('');

    function updateProducts() {
        const query = search.value.trim().toLocaleLowerCase(i18n.languages[currentLanguage].locale);
        const favorites = new Set(readFavorites());
        let visibleProducts = products.filter((product) => {
            const matchesCategory = activeCategory === 'Усі' ||
                (activeCategory === FAVORITES_FILTER
                    ? favorites.has(String(product.id))
                    : canonicalCategory(product.category) === activeCategory);
            const localizedProduct = localizeProduct(product);
            const matchesSearch = `${localizedProduct.title} ${localizedProduct.category} ${localizedProduct.description} ${product.title} ${product.category} ${product.description}`
                .toLocaleLowerCase(i18n.languages[currentLanguage].locale).includes(query);
            return matchesCategory && matchesSearch;
        });

        if (sort.value === 'price-asc') visibleProducts.sort((a, b) => a.price - b.price);
        if (sort.value === 'price-desc') visibleProducts.sort((a, b) => b.price - a.price);
        if (sort.value === 'name') {
            visibleProducts.sort((a, b) => localizeProduct(a).title.localeCompare(
                localizeProduct(b).title,
                i18n.languages[currentLanguage].locale
            ));
        }

        const cart = readCart();
        const renderProductCard = (product) => {
            const localizedProduct = localizeProduct(product);
            const isFavorite = favorites.has(String(product.id));
            return `
            <article class="product-card" data-product-card="${product.id}">
                <div class="product-image">
                    <button class="favorite-button${isFavorite ? ' is-favorite' : ''}"
                        type="button" data-favorite="${product.id}"
                        aria-label="${translate(isFavorite ? 'removeFavorite' : 'addFavorite')} ${localizedProduct.title} ${translate('favoriteLabel')}"
                        aria-pressed="${isFavorite}">${isFavorite ? '♥' : '♡'}</button>
                    <div class="product-image-button" aria-label="${localizedProduct.title}">
                        <img src="${product.image}" alt="${localizedProduct.title}" loading="lazy">
                    </div>
                </div>
                <div class="product-info">
                    <h3 class="product-name">${localizedProduct.title}</h3>
                    <p class="product-description">${localizedProduct.description}</p>
                    <div class="product-bottom">
                        <strong class="product-price">${formatCurrency(product.price)}</strong>
                        ${renderProductCartActions(product, cart[product.id] || 0)}
                    </div>
                </div>
            </article>
            `;
        };

        if (activeCategory === 'Усі') {
            const groupNames = ['Гітари', 'Клавішні', 'Ударні', 'Аксесуари'];
            const groupedProducts = new Map();

            visibleProducts.forEach((product) => {
                const groupName = canonicalCategory(product.category);
                if (!groupedProducts.has(groupName)) groupedProducts.set(groupName, []);
                groupedProducts.get(groupName).push(product);
            });

            const orderedGroups = [
                ...groupNames.filter((groupName) => groupedProducts.has(groupName)),
                ...[...groupedProducts.keys()].filter((groupName) => !groupNames.includes(groupName))
            ];
            grid.innerHTML = orderedGroups.map((groupName) => `
                <section class="product-category-row" aria-label="${localizeCategory(groupName)}">
                    <h3>${localizeCategory(groupName)}</h3>
                    <div class="product-category-grid">
                        ${groupedProducts.get(groupName).map(renderProductCard).join('')}
                    </div>
                </section>
            `).join('');
        } else {
            grid.innerHTML = visibleProducts.map(renderProductCard).join('');
        }

        if (visibleProducts.length === 0) {
            showStatus(status, activeCategory === FAVORITES_FILTER
                ? translate('favoritesEmpty')
                : translate('searchEmpty'));
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
        const favoriteButton = event.target.closest('[data-favorite]');
        if (favoriteButton) {
            const productId = favoriteButton.dataset.favorite;
            const favorites = new Set(readFavorites());
            if (favorites.has(productId)) {
                favorites.delete(productId);
            } else {
                favorites.add(productId);
            }
            saveFavorites([...favorites]);
            updateProducts();
            return;
        }

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

    });

    if (productDialog) {
        productDialog.querySelector('.product-dialog-close').addEventListener('click', () => {
            productDialog.close();
        });
        productDialog.addEventListener('click', (event) => {
            if (event.target === productDialog) productDialog.close();
        });
    }

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
        const localizedProduct = localizeProduct(product);
        return `
            <article class="cart-item">
                <div class="cart-item-art" aria-hidden="true">
                    <img src="${product.image}" alt="" loading="lazy">
                </div>
                <div class="cart-item-details">
                    <span class="product-category">${localizedProduct.category}</span>
                    <h2>${localizedProduct.title}</h2>
                    <strong>${formatCurrency(product.price)}</strong>
                </div>
                <div class="quantity-control" aria-label="${translate('quantity')}: ${quantity}">
                    <button type="button" data-quantity="${id}" data-change="-1" aria-label="${translate('decreaseQuantity')}">−</button>
                    <span>${quantity}</span>
                    <button type="button" data-quantity="${id}" data-change="1" aria-label="${translate('increaseQuantity')}">+</button>
                </div>
                <button class="remove-button" type="button" data-remove="${id}">${translate('remove')}</button>
            </article>
        `;
    }).join('') : `
        <div class="empty-cart">
            <span aria-hidden="true">♫</span>
            <h2>${translate('cartEmpty')}</h2>
            <p>${translate('cartEmptyCopy')}</p>
            <a class="button button-dark" href="index.html#catalog">${translate('toCatalog')} <span aria-hidden="true">→</span></a>
        </div>
    `;

    const total = entries.reduce((sum, [id, quantity]) => {
        return sum + productById.get(id).price * quantity;
    }, 0);
    document.querySelector('#cart-subtotal').textContent = formatCurrency(total);
    document.querySelector('#cart-total').textContent = formatCurrency(total);
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
            showStatus(status, translate('emptyCheckout'), true);
            return;
        }

        const customerName = checkoutForm.elements.name.value.trim();
        document.querySelector('#success-name').textContent = customerName;
        document.querySelector('#success-message').textContent = translate('successMessage', {
            total: formatCurrency(total)
        });
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
    try {
        initializeLanguage();
        const status = document.querySelector('#catalog-status') || document.querySelector('#cart-status');
        const cart = readCart();
        readFavorites();
        updateCartCount(cart);
        const products = await loadProducts();
        renderCatalog(products);
        renderCart(products);
    } catch (error) {
        console.error('Не вдалося запустити магазин:', error);
        const status = document.querySelector('#catalog-status') || document.querySelector('#cart-status');
        showStatus(status, translate('loadError'), true);
    }
}

initializeStore();
