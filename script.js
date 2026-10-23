const btn = document.querySelector('.order-btn');

btn.addEventListener('click', () => {
    gtag('event', 'order_button_clicked');
    console.log('Дані відправлено!');
});