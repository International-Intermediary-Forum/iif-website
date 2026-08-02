const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.primary-nav');

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  navigation.classList.toggle('open', !isOpen);
});

navigation.addEventListener('click', (event) => {
  if (event.target.matches('a')) {
    menuButton.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('open');
  }
});
