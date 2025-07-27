document.addEventListener('DOMContentLoaded', function () {
  // Mobile Menu Functionality
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navRight = document.querySelector('.nav-right');
  const mobileNavLinks = document.querySelectorAll('.nav-link');
  
  // Toggle mobile menu zx
  mobileMenuBtn.addEventListener('click', () => {
    mobileMenuBtn.classList.toggle('active');
    navRight.classList.toggle('active');
    document.body.style.overflow = navRight.classList.contains('active') ? 'hidden' : '';
  });
  
  // Close mobile menu when clicking on a link
  mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      mobileMenuBtn.classList.remove('active');
      navRight.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
  
  // Close mobile menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!mobileMenuBtn.contains(e.target) && !navRight.contains(e.target)) {
      mobileMenuBtn.classList.remove('active');
      navRight.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
  
  // Dark Mode Functionality
  const themeToggle = document.getElementById('themeToggle');
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  
  // Get current theme from document attribute (set by head script)
  const getCurrentTheme = () => {
    return document.documentElement.getAttribute('data-theme') || 'light';
  };
  
  // Apply theme to document
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update client logo image based on theme
    const clientLogo = document.getElementById('clientLogo');
    if (clientLogo) {
      clientLogo.src = theme === 'dark' ? 'src/second.jpg' : 'src/IMG_20250723_202505_502.jpg';
    }
    
    // Update navbar background immediately based on theme and scroll position
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      if (window.scrollY > 50) {
        navbar.style.background = theme === 'dark' 
          ? 'rgba(15, 23, 42, 0.98)' 
          : 'rgba(255, 255, 255, 0.98)';
        navbar.style.boxShadow = '0 2px 20px var(--shadow-medium)';
      } else {
        navbar.style.background = theme === 'dark' 
          ? 'rgba(15, 23, 42, 0.95)' 
          : 'rgba(255, 255, 255, 0.95)';
        navbar.style.boxShadow = 'none';
      }
    }
    

  };
  
  // Set initial client logo image immediately when DOM loads
  const setInitialClientLogo = () => {
    const currentTheme = getCurrentTheme();
    const clientLogo = document.getElementById('clientLogo');
    if (clientLogo) {
      clientLogo.src = currentTheme === 'dark' ? 'src/second.jpg' : 'src/IMG_20250723_202505_502.jpg';
    }
  };
  
  // Call immediately
  setInitialClientLogo();
  
  // Fallback: Use MutationObserver to ensure image is set if DOM changes
  const clientLogoObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        const clientLogo = document.getElementById('clientLogo');
        if (clientLogo && !clientLogo.src) {
          setInitialClientLogo();
        }
      }
    });
  });
  
  // Start observing
  clientLogoObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Theme toggle event listener
  themeToggle.addEventListener('click', () => {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    
    // Add click animation
    themeToggle.style.transform = 'scale(0.95)';
    setTimeout(() => {
      themeToggle.style.transform = '';
    }, 150);
  });
  
  // Listen for system theme changes
  prefersDarkScheme.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  // FAQ Functionality
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question');
    btn.addEventListener('click', function () {
      // Close all other open items
      faqItems.forEach(i => {
        if (i !== item) i.classList.remove('open');
      });
      // Toggle this one
      item.classList.toggle('open');
    });
  });

  // Smooth scrolling for navigation links
  const navLinks = document.querySelectorAll('.nav-link, .btn[href^="#"]');
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetSection = document.querySelector(targetId);
      
      if (targetSection) {
        const offsetTop = targetSection.offsetTop - 80; // Account for fixed navbar
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
      }
    });
  });

  // Navbar background on scroll
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', function() {
    if (window.scrollY > 50) {
      navbar.style.background = document.documentElement.getAttribute('data-theme') === 'dark' 
        ? 'rgba(15, 23, 42, 0.98)' 
        : 'rgba(255, 255, 255, 0.98)';
      navbar.style.boxShadow = '0 2px 20px var(--shadow-medium)';
    } else {
      navbar.style.background = document.documentElement.getAttribute('data-theme') === 'dark' 
        ? 'rgba(15, 23, 42, 0.95)' 
        : 'rgba(255, 255, 255, 0.95)';
      navbar.style.boxShadow = 'none';
    }
  });

  // Intersection Observer for animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe elements for animation
  const animateElements = document.querySelectorAll('.service-card, .stat-item, .contact-item, .faq-item');
  animateElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });

  // Typing effect for code window
  const codeElement = document.querySelector('.code-content code');
  if (codeElement) {
    const originalText = codeElement.textContent;
    codeElement.textContent = '';
    
    let i = 0;
    const typeWriter = () => {
      if (i < originalText.length) {
        codeElement.textContent += originalText.charAt(i);
        i++;
        setTimeout(typeWriter, 50);
      }
    };
    
    // Start typing effect when code window is visible
    const codeObserver = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(typeWriter, 1000);
          codeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    codeObserver.observe(document.querySelector('.code-window'));
  }

  // Service card hover effects
  const serviceCards = document.querySelectorAll('.service-card');
  serviceCards.forEach(card => {
    card.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-8px) scale(1.02)';
    });
    
    card.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0) scale(1)';
    });
  });

  // Button click effects
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(button => {
    button.addEventListener('click', function(e) {
      // Create ripple effect
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.classList.add('ripple');
      
      this.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });

  // Add ripple effect styles
  const style = document.createElement('style');
  style.textContent = `
    .btn {
      position: relative;
      overflow: hidden;
    }
    
    .ripple {
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: scale(0);
      animation: ripple-animation 0.6s linear;
      pointer-events: none;
    }
    
    @keyframes ripple-animation {
      to {
        transform: scale(4);
        opacity: 0;
      }
    }
    
    .theme-transitioning * {
      transition: none !important;
    }
    
    .theme-transitioning .toggle-thumb {
      transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease !important;
    }
  `;
  document.head.appendChild(style);

  // Stats counter animation
  const statNumbers = document.querySelectorAll('.stat-number');
  const statsObserver = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target;
        const finalValue = target.textContent;
        const isPercentage = finalValue.includes('%');
        const numericValue = parseInt(finalValue.replace(/\D/g, ''));
        
        let currentValue = 0;
        const increment = numericValue / 50;
        
        const counter = setInterval(() => {
          currentValue += increment;
          if (currentValue >= numericValue) {
            currentValue = numericValue;
            clearInterval(counter);
          }
          target.textContent = Math.floor(currentValue) + (isPercentage ? '%' : '');
        }, 30);
        
        statsObserver.unobserve(target);
      }
    });
  }, { threshold: 0.5 });
  
  statNumbers.forEach(stat => {
    statsObserver.observe(stat);
  });

  // Mobile menu toggle (for future mobile menu implementation)
  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', function() {
      const navLinks = document.querySelector('.nav-links');
      navLinks.classList.toggle('active');
    });
  }

  // Preload critical images
  const criticalImages = document.querySelectorAll('img[src]');
  criticalImages.forEach(img => {
    if (img.complete) {
      img.style.opacity = '1';
    } else {
      img.addEventListener('load', function() {
        this.style.opacity = '1';
      });
    }
  });

  // Add loading states to buttons
  const actionButtons = document.querySelectorAll('.btn-primary, .btn-secondary');
  actionButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      if (this.textContent.includes('Get Quote') || this.textContent.includes('Start a Project')) {
        e.preventDefault();
        const originalText = this.textContent;
        this.textContent = 'Loading...';
        this.disabled = true;
        
        // Simulate loading (replace with actual form submission)
        setTimeout(() => {
          this.textContent = originalText;
          this.disabled = false;
          // Here you would typically redirect to a contact form or open a modal
        }, 2000);
      }
    });
  });
});
