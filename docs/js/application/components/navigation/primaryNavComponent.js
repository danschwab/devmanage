import { html } from '../../utils/template-helpers.js';

export const PrimaryNavComponent = {
    props: {
        isMenuOpen: {
            type: Boolean,
            default: false
        },
        navigationItems: {
            type: Array,
            default: () => []
        },
        currentPage: {
            type: String,
            default: 'dashboard'
        },
        isAuthenticated: {
            type: Boolean,
            default: false
        },
        isAuthLoading: {
            type: Boolean,
            default: false
        },
        currentUser: {
            type: Object,
            default: () => null
        }
    },
    emits: [
        'toggle-menu',
        'navigate-to-page',
        'login',
        'logout'
    ],
    methods: {
        toggleMenu() {
            this.$emit('toggle-menu');
        },
        navigateToPage(pageFile) {
            this.$emit('navigate-to-page', pageFile);
        },
        login() {
            this.$emit('login');
        },
        logout() {
            this.$emit('logout');
        }
    },
    template: html`
        <header>
            <nav :class="{ 'open': isMenuOpen }">
                <a href="#"><img src="images/logo.png" alt="Top Shelf Exhibits" /></a>
                
                <span id="navbar">
                    <template v-if="isAuthenticated">
                        <a v-for="item in navigationItems" 
                           :key="item.file"
                           :class="{ 'active': currentPage === item.file }"
                           @click="navigateToPage(item.file); $emit('toggle-menu')"
                           href="#">
                            {{ item.title }}
                        </a>
                    </template>
                    
                    <button v-if="!isAuthenticated" 
                            @click="login" 
                            :disabled="isAuthLoading"
                            class="login-out-button active">
                        {{ isAuthLoading ? 'Loading...' : 'Login' }}
                    </button>
                    <button v-else 
                            @click="logout" 
                            :disabled="isAuthLoading"
                            class="login-out-button">
                        {{ isAuthLoading ? 'Logging out...' : 'Logout (' + (currentUser?.name || '') + ')' }}
                    </button>
                </span>
                
                <button class="button-symbol white" @click="toggleMenu">
                    {{ isMenuOpen ? '×' : '≡' }}
                </button>
            </nav>
        </header>
    `
};
