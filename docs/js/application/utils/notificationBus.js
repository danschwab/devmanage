const { reactive } = Vue;

/**
 * notificationBus — reactive singleton for scoped banner notifications.
 *
 * Content components call setBanners(scope, banners) to push their banner
 * state up to the BannerNotifications rendered inside ContainerComponent.
 * Use containerPath as the scope key. Call clearBanners(scope) on beforeUnmount.
 *
 * App-level banners (auth, network) are handled via a computed in app.js and
 * passed directly to BannerNotifications — they do not go through this bus.
 */
const _store = reactive({});
const _scrolledOutState = reactive({});

export const notificationBus = {
    setBanners(scope, banners) {
        _store[scope] = banners;
    },
    getBanners(scope) {
        return _store[scope] || [];
    },
    clearBanners(scope) {
        delete _store[scope];
        delete _scrolledOutState[scope];
    },
    setScrolledOut(scope, isScrolledOut, visibleBanners) {
        if (isScrolledOut && visibleBanners && visibleBanners.length > 0) {
            _scrolledOutState[scope] = visibleBanners;
        } else {
            delete _scrolledOutState[scope];
        }
    },
    getAllScrolledOutBanners() {
        const allBanners = [];
        for (const scope in _scrolledOutState) {
            const banners = _scrolledOutState[scope];
            if (Array.isArray(banners)) {
                allBanners.push(...banners.map(b => ({ ...b, _scope: scope })));
            }
        }
        return allBanners;
    }
};
