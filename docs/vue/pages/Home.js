// Home/Plan page component
import Container from '../components/Container.js';

export default {
    name: 'Home',
    components: {
        Container
    },
    setup() {
        const { ref, onMounted } = Vue;
        
        const planData = ref({
            upcomingEvents: [],
            recentPlans: []
        });
        
        onMounted(async () => {
            // Load plan data from your existing data management
            console.log('Home/Plan page mounted');
        });
        
        return {
            planData
        };
    },
    template: `
        <Container header-content="<h1>Plan</h1>">
            <div class="plan-content">
                <div class="section">
                    <h2>Upcoming Events</h2>
                    <div v-if="planData.upcomingEvents.length === 0" class="empty-state">
                        <p>No upcoming events scheduled.</p>
                        <button class="btn-primary">Create New Event</button>
                    </div>
                    <div v-else class="events-list">
                        <div 
                            v-for="event in planData.upcomingEvents" 
                            :key="event.id"
                            class="event-card"
                        >
                            <!-- Event content will go here -->
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Recent Plans</h2>
                    <div v-if="planData.recentPlans.length === 0" class="empty-state">
                        <p>No recent plans.</p>
                    </div>
                    <div v-else class="plans-list">
                        <div 
                            v-for="plan in planData.recentPlans" 
                            :key="plan.id"
                            class="plan-card"
                        >
                            <!-- Plan content will go here -->
                        </div>
                    </div>
                </div>
            </div>
        </Container>
    `
};
