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

  
  const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  let konamiIndex = 0;
  let konamiActivated = false;

  // Create sparkle element
  function createSparkle(x, y) {
    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle';
    
    const sparkleStyle = `
      position: fixed;
      width: 4px;
      height: 4px;
      background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #feca57, #ff9ff3);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      animation: sparkle-animation 1.5s ease-out forwards;
    `;
    
    sparkle.style.cssText = sparkleStyle;
    
    // Position the sparkle
    if (x !== undefined && y !== undefined) {
      sparkle.style.left = x + 'px';
      sparkle.style.top = y + 'px';
    } else {
      // Random position around the popup
      const popup = document.querySelector('.konami-popup');
      if (popup) {
        const rect = popup.getBoundingClientRect();
        const popupX = rect.left + Math.random() * rect.width;
        const popupY = rect.top + Math.random() * rect.height;
        sparkle.style.left = popupX + 'px';
        sparkle.style.top = popupY + 'px';
      } else {
        sparkle.style.left = Math.random() * window.innerWidth + 'px';
        sparkle.style.top = Math.random() * window.innerHeight + 'px';
      }
    }
    
    document.body.appendChild(sparkle);
    
    const animationDuration = 1500;
    setTimeout(() => {
      if (sparkle.parentNode) {
        sparkle.remove();
      }
    }, animationDuration);
  }

  // Create sparkle animation
  function createSparkleAnimation() {
    const sparkleCount = 30;
    for (let i = 0; i < sparkleCount; i++) {
      setTimeout(() => {
        createSparkle();
      }, i * 50);
    }
  }





  // Create professional popup
  function createKonamiPopup() {
    if (konamiActivated) return;
    konamiActivated = true;

    // Play startup sound
    const startupAudio = new Audio('src/startup.mp3');
    startupAudio.play().catch(e => console.log('Audio play failed:', e));

    // Create massive sparkle explosion effect
    function createBlowEffects() {
      // Create sparkles all over the screen
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          const x = Math.random() * window.innerWidth;
          const y = Math.random() * window.innerHeight;
          createSparkle(x, y, 'random');
        }, i * 20);
      }
    }

    // Create popup overlay
    const overlay = document.createElement('div');
    overlay.className = 'konami-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      animation: fadeIn 0.5s ease-out forwards;
    `;

    // Create popup content
    const popup = document.createElement('div');
    popup.className = 'konami-popup';
    popup.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      color: white;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 50px rgba(102, 126, 234, 0.5);
      max-width: 500px;
      width: 90%;
      position: relative;
      overflow: hidden;
      transform: scale(0.8);
      animation: popupIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      border: 2px solid rgba(255, 255, 255, 0.2);
    `;

    // Add animated background
    const bgAnimation = document.createElement('div');
    bgAnimation.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%);
      animation: shimmer 3s infinite;
      z-index: 1;
    `;

    // Create content wrapper
    const content = document.createElement('div');
    content.style.cssText = `
      position: relative;
      z-index: 2;
    `;

    // Add icon
    const icon = document.createElement('div');
    icon.innerHTML = '🎮';
    icon.style.cssText = `
      font-size: 4rem;
      margin-bottom: 20px;
      animation: bounce 2s infinite;
    `;

    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Konami Code Activated!';
    title.style.cssText = `
      font-size: 2rem;
      margin: 0 0 15px 0;
      font-weight: 700;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    `;

    // Add subtitle
    const subtitle = document.createElement('p');
    subtitle.textContent = 'You\'ve discovered the secret! Welcome to the developer\'s playground.';
    subtitle.style.cssText = `
      font-size: 1.1rem;
      margin: 0 0 25px 0;
      opacity: 0.9;
      line-height: 1.5;
    `;

    // Add next button (instead of close)
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 12px 30px;
      border-radius: 25px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    `;

    // Add hover effect to next button
    nextBtn.addEventListener('mouseenter', () => {
      nextBtn.style.background = 'rgba(255, 255, 255, 0.3)';
      nextBtn.style.transform = 'translateY(-2px)';
    });

    nextBtn.addEventListener('mouseleave', () => {
      nextBtn.style.background = 'rgba(255, 255, 255, 0.2)';
      nextBtn.style.transform = 'translateY(0)';
    });

    // Next button function - creates error window
    const showErrorWindow = () => {
      // Play error sound
      const errorAudio = new Audio('src/error.mp3');
      errorAudio.play().catch(e => console.log('Audio play failed:', e));

      // Remove current popup
      overlay.style.animation = 'fadeOut 0.5s ease-out forwards';
      popup.style.animation = 'popupOut 0.5s ease-out forwards';
      
      setTimeout(() => {
        document.body.removeChild(overlay);
        
        // Create error window
        createErrorWindow();
      }, 500);
    };

    nextBtn.addEventListener('click', showErrorWindow);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) showErrorWindow();
    });

    // Assemble popup
    content.appendChild(icon);
    content.appendChild(title);
    content.appendChild(subtitle);
    content.appendChild(nextBtn);
    
    popup.appendChild(bgAnimation);
    popup.appendChild(content);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Trigger blow effects and sparkle animation after popup appears
    setTimeout(() => {
      createBlowEffects();
      createSparkleAnimation();
    }, 600);

    // Add keyboard listener for escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        showErrorWindow();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  // Create error window
  function createErrorWindow() {
    // Create error overlay
    const errorOverlay = document.createElement('div');
    errorOverlay.className = 'error-overlay';
    errorOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(255, 0, 0, 0.9);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      animation: fadeIn 0.5s ease-out forwards;
    `;

    // Create error popup
    const errorPopup = document.createElement('div');
    errorPopup.className = 'error-popup';
    errorPopup.style.cssText = `
      background: linear-gradient(135deg, #ff4757 0%, #c44569 100%);
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      color: white;
      box-shadow: 0 20px 60px rgba(255, 71, 87, 0.5), 0 0 50px rgba(255, 0, 0, 0.5);
      max-width: 500px;
      width: 90%;
      position: relative;
      overflow: hidden;
      transform: scale(0.8);
      animation: popupIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      border: 2px solid rgba(255, 255, 255, 0.3);
    `;

    // Add error content
    const errorContent = document.createElement('div');
    errorContent.style.cssText = `
      position: relative;
      z-index: 2;
    `;

    // Add error icon
    const errorIcon = document.createElement('div');
    errorIcon.innerHTML = '⚠️';
    errorIcon.style.cssText = `
      font-size: 4rem;
      margin-bottom: 20px;
      animation: bounce 2s infinite;
    `;

    // Add error title
    const errorTitle = document.createElement('h2');
    errorTitle.textContent = 'ERROR DETECTED!';
    errorTitle.style.cssText = `
      font-size: 2rem;
      margin: 0 0 15px 0;
      font-weight: 700;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    `;

    // Add error message
    const errorMessage = document.createElement('p');
    errorMessage.textContent = 'System malfunction detected. Initiating emergency protocols...';
    errorMessage.style.cssText = `
      font-size: 1.1rem;
      margin: 0 0 25px 0;
      opacity: 0.9;
      line-height: 1.5;
    `;

    // Add continue button
    const continueBtn = document.createElement('button');
    continueBtn.textContent = 'Continue';
    continueBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 12px 30px;
      border-radius: 25px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    `;

    // Add hover effect
    continueBtn.addEventListener('mouseenter', () => {
      continueBtn.style.background = 'rgba(255, 255, 255, 0.3)';
      continueBtn.style.transform = 'translateY(-2px)';
    });

    continueBtn.addEventListener('mouseleave', () => {
      continueBtn.style.background = 'rgba(255, 255, 255, 0.2)';
      continueBtn.style.transform = 'translateY(0)';
    });

    // Continue button function - starts page glitching
    const startGlitching = () => {
      // Remove error window
      errorOverlay.style.animation = 'fadeOut 0.5s ease-out forwards';
      errorPopup.style.animation = 'popupOut 0.5s ease-out forwards';
      
      setTimeout(() => {
        document.body.removeChild(errorOverlay);
        
        // Start page glitching effect
        initiatePageGlitching();
      }, 500);
    };

    continueBtn.addEventListener('click', startGlitching);
    errorOverlay.addEventListener('click', (e) => {
      if (e.target === errorOverlay) startGlitching();
    });

    // Assemble error popup
    errorContent.appendChild(errorIcon);
    errorContent.appendChild(errorTitle);
    errorContent.appendChild(errorMessage);
    errorContent.appendChild(continueBtn);
    
    errorPopup.appendChild(errorContent);
    errorOverlay.appendChild(errorPopup);
    document.body.appendChild(errorOverlay);

    // Add keyboard listener for escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        startGlitching();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  // Page glitching and fading effect
  function initiatePageGlitching() {
    
    // Get all elements to fade away
    const allElements = document.querySelectorAll('*:not(body):not(html)');
    const elementsArray = Array.from(allElements);
    
    // Shuffle array for random order
    for (let i = elementsArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [elementsArray[i], elementsArray[j]] = [elementsArray[j], elementsArray[i]];
    }
    
    // Get current theme for final background
    const currentTheme = getCurrentTheme();
    const finalBackground = currentTheme === 'dark' ? '#1a1a2e' : '#ffffff';
    
    // Add glitch effect to body
    document.body.style.cssText += `
      animation: glitchEffect 0.1s infinite;
      background: ${finalBackground} !important;
    `;
    
    // Fade elements one by one
    elementsArray.forEach((element, index) => {
      setTimeout(() => {
        if (element.parentNode) {
          element.style.transition = 'opacity 0.3s ease-out';
          element.style.opacity = '0';
          
          setTimeout(() => {
            if (element.parentNode && element.style.opacity === '0') {
              element.parentNode.removeChild(element);
            }
          }, 300);
        }
      }, index * 50); // 50ms delay between each element
    });
    
    // Add glitch CSS
    const glitchStyles = document.createElement('style');
    glitchStyles.textContent = `
      @keyframes glitchEffect {
        0% { transform: translate(0); }
        20% { transform: translate(-2px, 2px); }
        40% { transform: translate(-2px, -2px); }
        60% { transform: translate(2px, 2px); }
        80% { transform: translate(2px, -2px); }
        100% { transform: translate(0); }
      }
    `;
    document.head.appendChild(glitchStyles);
    
    // Reset Konami state after glitching
    setTimeout(() => {
      konamiActivated = false;
      konamiIndex = 0;
    }, elementsArray.length * 50 + 1000);
  }

  // Konami code keydown listener
  document.addEventListener('keydown', (e) => {
    if (konamiActivated) return;

    if (e.code === konamiCode[konamiIndex]) {
      konamiIndex++;
      if (konamiIndex === konamiCode.length) {
        // Check if page has been glitched (all elements removed)
        const allElements = document.querySelectorAll('*:not(body):not(html)');
        if (allElements.length === 0) {
          // Page has been glitched, play restart sound and reload
          const restartAudio = new Audio('src/restart.mp3');
          restartAudio.play().catch(e => console.log('Audio play failed:', e));
          
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        } else {
          // Normal Konami code activation
          createKonamiPopup();
        }
      }
    } else {
      konamiIndex = 0;
    }
  });

  // Add CSS animations
  const konamiStyles = document.createElement('style');
  konamiStyles.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    
    @keyframes popupIn {
      from { 
        transform: scale(0.8) translateY(50px);
        opacity: 0;
      }
      to { 
        transform: scale(1) translateY(0);
        opacity: 1;
      }
    }
    
    @keyframes popupOut {
      from { 
        transform: scale(1) translateY(0);
        opacity: 1;
      }
      to { 
        transform: scale(0.8) translateY(50px);
        opacity: 0;
      }
    }
    
    @keyframes sparkle-animation {
      0% {
        transform: scale(0) rotate(0deg);
        opacity: 1;
      }
      50% {
        transform: scale(1) rotate(180deg);
        opacity: 1;
      }
      100% {
        transform: scale(0) rotate(360deg);
        opacity: 0;
      }
    }
    

    

    
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    
    @keyframes bounce {
      0%, 20%, 50%, 80%, 100% {
        transform: translateY(0);
      }
      40% {
        transform: translateY(-10px);
      }
      60% {
        transform: translateY(-5px);
      }
    }
  `;
  document.head.appendChild(konamiStyles);
});
