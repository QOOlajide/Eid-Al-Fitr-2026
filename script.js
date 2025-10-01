// Eid al-Fitr 2025 Website JavaScript

// DOM Elements
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const updatesBanner = document.getElementById('updatesBanner');
const updateText = document.getElementById('updateText');
const glossaryTooltip = document.getElementById('glossaryTooltip');
const tooltipTitle = document.getElementById('tooltipTitle');
const tooltipDefinition = document.getElementById('tooltipDefinition');

// Glossary terms data
const glossaryTerms = {
    'imam': {
        title: 'Imam',
        definition: 'The prayer leader who leads the congregation in prayer and delivers the khutbah (sermon).'
    },
    'iftar': {
        title: 'Iftar',
        definition: 'The evening meal that breaks the daily fast during Ramadan, traditionally eaten at sunset.'
    },
    'eid': {
        title: 'Eid al-Fitr',
        definition: 'The festival of breaking the fast, celebrated at the end of Ramadan to mark the completion of the holy month of fasting.'
    },
    'eid-prayer': {
        title: 'Eid Prayer',
        definition: 'A special congregational prayer performed on the morning of Eid al-Fitr, consisting of two rak\'ahs with additional takbirs.'
    },
    'rakah': {
        title: 'Rak\'ah',
        definition: 'A unit of prayer consisting of standing, bowing, and prostrating. Each prayer has a specific number of rak\'ahs.'
    },
    'takbir': {
        title: 'Takbir',
        definition: 'The phrase "Allahu Akbar" (God is Great) recited during prayer and special occasions like Eid.'
    },
    'khutbah': {
        title: 'Khutbah',
        definition: 'A sermon delivered by the Imam after the Eid prayer, providing guidance and reminders to the community.'
    },
    'zakat-al-fitr': {
        title: 'Zakat al-Fitr',
        definition: 'A charitable donation given before the Eid prayer to purify those who fast and help the poor and needy.'
    }
};

// Real-time updates data
const updates = [
    "Welcome to Eid al-Fitr 2025! Prayer begins at 8:00 AM",
    "Imam has arrived! Prayer will start in 15 minutes",
    "Community breakfast is now being served in the food court",
    "Children's activities are starting in the children's area",
    "Islamic lecture begins at 11:00 AM in the conference room",
    "Lunch service is now available in the food court",
    "Community social gathering starts at 2:00 PM"
];

// Initialize the website
document.addEventListener('DOMContentLoaded', function() {
    initializeNavigation();
    initializeUpdates();
    initializeScheduleFilters();
    initializeZakatForm();
    initializeForumForm();
    initializeGlossary();
    initializeSmoothScrolling();
});

// Navigation functionality
function initializeNavigation() {
    hamburger.addEventListener('click', function() {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function() {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });
}

// Real-time updates functionality
function initializeUpdates() {
    let currentUpdateIndex = 0;
    
    function updateBanner() {
        updateText.textContent = updates[currentUpdateIndex];
        currentUpdateIndex = (currentUpdateIndex + 1) % updates.length;
    }
    
    // Update every 10 seconds
    setInterval(updateBanner, 10000);
    
    // Initial update
    updateBanner();
}

// Schedule filters functionality
function initializeScheduleFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const scheduleItems = document.querySelectorAll('.schedule-item');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');
            
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Filter schedule items
            scheduleItems.forEach(item => {
                const category = item.getAttribute('data-category');
                if (filter === 'all' || category === filter) {
                    item.style.display = 'grid';
                    item.style.animation = 'fadeIn 0.5s ease-in';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
}

// Zakat form functionality
function initializeZakatForm() {
    const zakatForm = document.getElementById('zakatForm');
    const familySizeInput = document.getElementById('familySize');
    const amountInput = document.getElementById('amount');
    const totalAmountSpan = document.getElementById('totalAmount');
    
    function calculateTotal() {
        const familySize = parseInt(familySizeInput.value) || 1;
        const amount = parseFloat(amountInput.value) || 10;
        const total = familySize * amount;
        totalAmountSpan.textContent = total.toFixed(2);
    }
    
    familySizeInput.addEventListener('input', calculateTotal);
    amountInput.addEventListener('input', calculateTotal);
    
    zakatForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(this);
        const donorName = formData.get('donorName');
        const familySize = formData.get('familySize');
        const amount = formData.get('amount');
        const total = familySize * amount;
        
        // Simulate payment processing
        showPaymentModal(donorName, total);
    });
}

// Forum form functionality
function initializeForumForm() {
    const forumForm = document.getElementById('forumForm');
    
    forumForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(this);
        const title = formData.get('questionTitle');
        const content = formData.get('questionContent');
        
        // Add new question to the list
        addNewQuestion(title, content);
        
        // Reset form
        this.reset();
        
        // Show success message
        showNotification('Question posted successfully!', 'success');
    });
}

// Glossary functionality
function initializeGlossary() {
    const glossaryTerms = document.querySelectorAll('.glossary-term');
    
    glossaryTerms.forEach(term => {
        term.addEventListener('mouseenter', function(e) {
            const termKey = this.getAttribute('data-term');
            const termData = glossaryTerms[termKey];
            
            if (termData) {
                showTooltip(e, termData.title, termData.definition);
            }
        });
        
        term.addEventListener('mouseleave', function() {
            hideTooltip();
        });
        
        term.addEventListener('mousemove', function(e) {
            updateTooltipPosition(e);
        });
    });
}

// Smooth scrolling for navigation links
function initializeSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Utility functions
function showTooltip(event, title, definition) {
    tooltipTitle.textContent = title;
    tooltipDefinition.textContent = definition;
    glossaryTooltip.style.display = 'block';
    updateTooltipPosition(event);
}

function hideTooltip() {
    glossaryTooltip.style.display = 'none';
}

function updateTooltipPosition(event) {
    const x = event.clientX + 10;
    const y = event.clientY - 10;
    
    glossaryTooltip.style.left = x + 'px';
    glossaryTooltip.style.top = y + 'px';
}

function showPaymentModal(donorName, amount) {
    const modal = document.createElement('div');
    modal.className = 'payment-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Payment Confirmation</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p>Thank you, ${donorName}!</p>
                <p>Your Zakat al-Fitr payment of $${amount.toFixed(2)} has been processed.</p>
                <p>May Allah accept your charity and bless you abundantly.</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary close-modal">Close</button>
            </div>
        </div>
    `;
    
    // Add modal styles
    const modalStyles = `
        .payment-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        }
        .modal-content {
            background: white;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            border-bottom: 1px solid #eee;
        }
        .modal-header h3 {
            color: #2c5530;
            margin: 0;
        }
        .close-modal {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #666;
        }
        .modal-body {
            padding: 1.5rem;
            text-align: center;
        }
        .modal-footer {
            padding: 1.5rem;
            text-align: center;
            border-top: 1px solid #eee;
        }
    `;
    
    // Add styles if not already added
    if (!document.getElementById('modal-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'modal-styles';
        styleSheet.textContent = modalStyles;
        document.head.appendChild(styleSheet);
    }
    
    document.body.appendChild(modal);
    
    // Close modal functionality
    modal.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function() {
            document.body.removeChild(modal);
        });
    });
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function addNewQuestion(title, content) {
    const questionsList = document.querySelector('.questions-list');
    const newQuestion = document.createElement('div');
    newQuestion.className = 'question-item';
    newQuestion.innerHTML = `
        <h4>${title}</h4>
        <p>${content}</p>
        <span class="question-meta">Posted just now</span>
    `;
    
    questionsList.insertBefore(newQuestion, questionsList.firstChild);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add notification styles
    const notificationStyles = `
        .notification {
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1500;
            animation: slideInRight 0.3s ease-out;
        }
        .notification-success {
            background: #4a7c59;
        }
        .notification-info {
            background: #667eea;
        }
        .notification-error {
            background: #ff6b6b;
        }
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    
    // Add styles if not already added
    if (!document.getElementById('notification-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'notification-styles';
        styleSheet.textContent = notificationStyles;
        document.head.appendChild(styleSheet);
    }
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            document.body.removeChild(notification);
        }
    }, 3000);
}

// Add fade-in animation for schedule items
const fadeInStyles = `
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;

// Add animation styles
if (!document.getElementById('animation-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'animation-styles';
    styleSheet.textContent = fadeInStyles;
    document.head.appendChild(styleSheet);
}

// Intersection Observer for scroll animations
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

// Observe elements for scroll animations
document.addEventListener('DOMContentLoaded', function() {
    const animatedElements = document.querySelectorAll('.schedule-item, .step, .question-item');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});
