import { html, Requests, getReactiveStore } from '../../index.js';

/**
 * A show's output PDFs from the company Dropbox (CLIENT / YEAR / SHOW / OUTPUT), one detail item
 * per OUTPUT subfolder, each PDF a button that opens it in a new tab. Read through a reactive store,
 * so the list follows Dropbox changes. Used in the Schedule's and the Design Queue's show details.
 * Files in OLD folders (old groups) stay hidden behind one Show old button at the bottom.
 */
export const ShowOutputFiles = {
    name: 'ShowOutputFiles',
    props: {
        show: { type: String, default: '' },
        client: { type: String, default: '' },
        year: { type: [String, Number], default: '' }
    },
    data() {
        return { store: null, opening: null, showOld: false };
    },
    computed: {
        showKey() {
            return [this.show, this.client, this.year].join('|');
        },
        allGroups() {
            const projects = this.store?.data || [];
            return projects.flatMap(project => project.groups.map(group => ({
                key: `${project.path}/${group.old ? 'old:' : ''}${group.name}`,
                // Two project folders (a show filed under two client folders): say whose
                label: [projects.length > 1 ? project.client : '', group.name || 'OUTPUT'].filter(Boolean).join(' · '),
                old: !!group.old,
                files: group.files
            })));
        },
        groups() {
            return this.allGroups.filter(group => !group.old);
        },
        oldGroups() {
            return this.allGroups.filter(group => group.old);
        },
        shownGroups() {
            // Old groups after every project's current ones
            return this.showOld ? [...this.groups, ...this.oldGroups] : this.groups;
        },
        oldFileCount() {
            return this.oldGroups.reduce((n, group) => n + group.files.length, 0);
        },
        message() {
            if (!this.store || this.store.isLoading) return 'Looking in Dropbox…';
            if (this.store.error) return this.store.error;
            if (!this.store.data.length) return 'No Dropbox project folder found for this show.';
            if (!this.groups.length) return this.oldGroups.length ? 'Only old PDFs in OUTPUT.' : 'No PDFs in OUTPUT yet.';
            return '';
        }
    },
    watch: {
        showKey: {
            immediate: true,
            handler() {
                this.showOld = false;
                this.store = getReactiveStore(Requests.getShowOutputFiles, null, [this.show, this.client, String(this.year)]);
            }
        }
    },
    methods: {
        async open(file) {
            // The tab opens inside the click: one opened after waiting for the file would be blocked
            const tab = window.open('', '_blank');
            if (!tab) {
                this.$modal.alert('The browser blocked the new tab. Allow pop-ups for this site, then try again.', 'Tab blocked', false);
                return;
            }
            try {
                tab.document.title = file.name;
                tab.document.body.textContent = `Opening ${file.name}…`;
            } catch { /* the tab is already elsewhere */ }
            this.opening = file.path;
            try {
                tab.location.href = await Requests.getDropboxFileUrl(file.path);
            } catch (error) {
                tab.close();
                this.$modal.error(`Couldn't open ${file.name}: ${error.message}`, 'Dropbox');
            } finally {
                this.opening = null;
            }
        }
    },
    template: html`
        <div class="details-grid show-output-files">
            <div v-if="message" class="detail-item">
                <label>Dropbox Output</label>
                <span>
                    {{ message }}
                    <button v-if="store?.error && !store.isLoading" class="white small" @click="store.load('Looking in Dropbox…')">Try again</button>
                </span>
            </div>
            <div v-for="group in shownGroups" :key="group.key" class="detail-item">
                <label>{{ group.label }}</label>
                <span class="cell-button-list">
                    <button
                        v-for="file in group.files"
                        :key="file.path"
                        class="white small"
                        :title="file.name"
                        :disabled="opening === file.path"
                        @click="open(file)"
                    >{{ opening === file.path ? 'Opening…' : file.name }}</button>
                </span>
            </div>
            <button v-if="oldGroups.length" class="white small" @click="showOld = !showOld">
                {{ showOld ? 'Hide old' : 'Show old (' + oldFileCount + ')' }}
            </button>
        </div>
    `
};
