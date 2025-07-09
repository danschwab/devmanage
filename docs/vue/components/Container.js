// Container component - converted from html/templates/container.html
const { ref, computed } = Vue;

export default {
    name: 'Container',
    props: {
        headerContent: {
            type: String,
            default: ''
        },
        footerContent: {
            type: String,
            default: ''
        }
    },
    setup(props, { slots }) {
        return {
            props,
            slots
        };
    },
    template: `
        <div class="container">
            <div class="content">
                <!-- Header content slot or prop -->
                <div v-if="headerContent || slots.header" class="header-content">
                    <slot name="header">
                        <div v-html="headerContent"></div>
                    </slot>
                </div>
                
                <!-- Main content slot -->
                <div class="main-content">
                    <slot></slot>
                </div>
                
                <!-- Footer content slot or prop -->
                <div v-if="footerContent || slots.footer" class="footer-content">
                    <slot name="footer">
                        <div v-html="footerContent"></div>
                    </slot>
                </div>
            </div>
        </div>
    `
};
