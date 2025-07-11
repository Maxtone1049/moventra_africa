/* /web/static/src/js/services/session.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('web.session', function(require) {
    "use strict";
    var Session = require('web.Session');
    var modules = odoo._modules;
    var session = new Session(undefined,undefined,{
        modules: modules,
        use_cors: false
    });
    session.is_bound = session.session_bind();
    return session;
});
;
/* /web/static/src/js/public/public_env.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("web.public_env", function(require) {
    "use strict";
    const commonEnv = require("web.commonEnv");
    return commonEnv;
});
;
/* /web/static/src/js/public/public_crash_manager.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('web.PublicCrashManager', function(require) {
    "use strict";
    const core = require('web.core');
    const CrashManager = require('web.CrashManager').CrashManager;
    const PublicCrashManager = CrashManager.extend({
        _displayWarning(message, title, options) {
            this.displayNotification(Object.assign({}, options, {
                title,
                message,
                sticky: true,
            }));
        },
    });
    core.serviceRegistry.add('crash_manager', PublicCrashManager);
    return {
        CrashManager: PublicCrashManager,
    };
});
;
/* /web/static/src/js/public/public_notification.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('web.public.Notification', function(require) {
    'use strict';
    var Notification = require('web.Notification');
    Notification.include({
        xmlDependencies: ['/web/static/src/xml/notification.xml'],
    });
});
;
/* /web/static/src/js/public/public_root.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('web.public.root', function(require) {
    'use strict';
    var ajax = require('web.ajax');
    var dom = require('web.dom');
    const env = require('web.public_env');
    var session = require('web.session');
    var utils = require('web.utils');
    var publicWidget = require('web.public.widget');
    var publicRootRegistry = new publicWidget.RootWidgetRegistry();
    function getLang() {
        var html = document.documentElement;
        return (html.getAttribute('lang') || 'en_US').replace('-', '_');
    }
    var lang = utils.get_cookie('frontend_lang') || getLang();
    var localeDef = ajax.loadJS('/web/webclient/locale/' + lang.replace('-', '_'));
    var PublicRoot = publicWidget.RootWidget.extend({
        events: _.extend({}, publicWidget.RootWidget.prototype.events || {}, {
            'submit .js_website_submit_form': '_onWebsiteFormSubmit',
            'click .js_disable_on_click': '_onDisableOnClick',
        }),
        custom_events: _.extend({}, publicWidget.RootWidget.prototype.custom_events || {}, {
            call_service: '_onCallService',
            context_get: '_onContextGet',
            main_object_request: '_onMainObjectRequest',
            widgets_start_request: '_onWidgetsStartRequest',
            widgets_stop_request: '_onWidgetsStopRequest',
        }),
        init: function() {
            this._super.apply(this, arguments);
            this.env = env;
            this.publicWidgets = [];
        },
        willStart: function() {
            return Promise.all([this._super.apply(this, arguments), session.is_bound, localeDef]);
        },
        start: function() {
            var defs = [this._super.apply(this, arguments), this._startWidgets()];
            this.$(".o_image[data-mimetype^='image']").each(function() {
                var $img = $(this);
                if (/gif|jpe|jpg|png/.test($img.data('mimetype')) && $img.data('src')) {
                    $img.css('background-image', "url('" + $img.data('src') + "')");
                }
            });
            if (window.location.hash.indexOf("scrollTop=") > -1) {
                this.el.scrollTop = +window.location.hash.match(/scrollTop=([0-9]+)/)[1];
            }
            if ($.fn.placeholder) {
                $('input, textarea').placeholder();
            }
            this.$el.children().on('error.datetimepicker', this._onDateTimePickerError.bind(this));
            return Promise.all(defs);
        },
        _getContext: function(context) {
            return _.extend({
                'lang': getLang(),
            }, context || {});
        },
        _getExtraContext: function(context) {
            return this._getContext(context);
        },
        _getPublicWidgetsRegistry: function(options) {
            return publicWidget.registry;
        },
        _getRegistry: function() {
            return publicRootRegistry;
        },
        _startWidgets: function($from, options) {
            var self = this;
            if ($from === undefined) {
                $from = this.$('#wrapwrap');
                if (!$from.length) {
                    $from = this.$el;
                }
            }
            if (options === undefined) {
                options = {};
            }
            this._stopWidgets($from);
            var defs = _.map(this._getPublicWidgetsRegistry(options), function(PublicWidget) {
                var selector = PublicWidget.prototype.selector || '';
                var $target = dom.cssFind($from, selector, true);
                var defs = _.map($target, function(el) {
                    var widget = new PublicWidget(self,options);
                    self.publicWidgets.push(widget);
                    return widget.attachTo($(el));
                });
                return Promise.all(defs);
            });
            return Promise.all(defs);
        },
        _stopWidgets: function($from) {
            var removedWidgets = _.map(this.publicWidgets, function(widget) {
                if (!$from || $from.filter(widget.el).length || $from.find(widget.el).length) {
                    widget.destroy();
                    return widget;
                }
                return null;
            });
            this.publicWidgets = _.difference(this.publicWidgets, removedWidgets);
        },
        _onCallService: function(ev) {
            function _computeContext(context, noContextKeys) {
                context = _.extend({}, this._getContext(), context);
                if (noContextKeys) {
                    context = _.omit(context, noContextKeys);
                }
                return JSON.parse(JSON.stringify(context));
            }
            const payload = ev.data;
            let args = payload.args || [];
            if (payload.service === 'ajax' && payload.method === 'rpc') {
                args = args.concat(ev.target);
                var route = args[0];
                if (_.str.startsWith(route, '/web/dataset/call_kw/')) {
                    var params = args[1];
                    var options = args[2];
                    var noContextKeys;
                    if (options) {
                        noContextKeys = options.noContextKeys;
                        args[2] = _.omit(options, 'noContextKeys');
                    }
                    params.kwargs.context = _computeContext.call(this, params.kwargs.context, noContextKeys);
                }
            } else if (payload.service === 'ajax' && payload.method === 'loadLibs') {
                args[1] = _computeContext.call(this, args[1]);
            }
            const service = this.env.services[payload.service];
            const result = service[payload.method].apply(service, args);
            payload.callback(result);
        },
        _onContextGet: function(ev) {
            if (ev.data.extra) {
                ev.data.callback(this._getExtraContext(ev.data.context));
            } else {
                ev.data.callback(this._getContext(ev.data.context));
            }
        },
        _onMainObjectRequest: function(ev) {
            var repr = $('html').data('main-object');
            var m = repr.match(/(.+)\((\d+),(.*)\)/);
            ev.data.callback({
                model: m[1],
                id: m[2] | 0,
            });
        },
        _onWidgetsStartRequest: function(ev) {
            this._startWidgets(ev.data.$target, ev.data.options).then(ev.data.onSuccess).guardedCatch(ev.data.onFailure);
        },
        _onWidgetsStopRequest: function(ev) {
            this._stopWidgets(ev.data.$target);
        },
        _onWebsiteFormSubmit: function(ev) {
            var $buttons = $(ev.currentTarget).find('button[type="submit"], a.a-submit');
            _.each($buttons, function(btn) {
                var $btn = $(btn);
                $btn.html('<i class="fa fa-spinner fa-spin"></i> ' + $btn.text());
                $btn.prop('disabled', true);
            });
        },
        _onDisableOnClick: function(ev) {
            $(ev.currentTarget).addClass('disabled');
        },
        _onDateTimePickerError: function(ev) {
            return false;
        },
    });
    return {
        PublicRoot: PublicRoot,
        publicRootRegistry: publicRootRegistry,
    };
});
;
/* /website/static/src/js/content/website_root_instance.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('root.widget', function(require) {
    'use strict';
    const AbstractService = require('web.AbstractService');
    const env = require('web.public_env');
    var lazyloader = require('web.public.lazyloader');
    var websiteRootData = require('website.root');
    owl.config.mode = env.isDebug() ? "dev" : "prod";
    owl.Component.env = env;
    AbstractService.prototype.deployServices(env);
    var websiteRoot = new websiteRootData.WebsiteRoot(null);
    return lazyloader.allScriptsLoaded.then(function() {
        return websiteRoot.attachTo(document.body).then(function() {
            return websiteRoot;
        });
    });
});
;
/* /web/static/src/js/public/public_widget.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('web.public.widget', function(require) {
    'use strict';
    var Class = require('web.Class');
    var dom = require('web.dom');
    var mixins = require('web.mixins');
    var session = require('web.session');
    var Widget = require('web.Widget');
    var RootWidget = Widget.extend({
        custom_events: _.extend({}, Widget.prototype.custom_events || {}, {
            'registry_update': '_onRegistryUpdate',
            'get_session': '_onGetSession',
        }),
        init: function() {
            this._super.apply(this, arguments);
            this._widgets = [];
            this._listenToUpdates = false;
            this._getRegistry().setParent(this);
        },
        start: function() {
            var defs = [this._super.apply(this, arguments)];
            defs.push(this._attachComponents());
            this._listenToUpdates = true;
            return Promise.all(defs);
        },
        _attachComponent: function(childInfo, $from) {
            var self = this;
            var $elements = dom.cssFind($from || this.$el, childInfo.selector);
            var defs = _.map($elements, function(element) {
                var w = new childInfo.Widget(self);
                self._widgets.push(w);
                return w.attachTo(element);
            });
            return Promise.all(defs);
        },
        _attachComponents: function($from) {
            var self = this;
            var childInfos = this._getRegistry().get();
            var defs = _.map(childInfos, function(childInfo) {
                return self._attachComponent(childInfo, $from);
            });
            return Promise.all(defs);
        },
        _getRegistry: function() {},
        _onGetSession: function(event) {
            if (event.data.callback) {
                event.data.callback(session);
            }
        },
        _onRegistryUpdate: function(ev) {
            ev.stopPropagation();
            if (this._listenToUpdates) {
                this._attachComponent(ev.data);
            }
        },
    });
    var RootWidgetRegistry = Class.extend(mixins.EventDispatcherMixin, {
        init: function() {
            mixins.EventDispatcherMixin.init.call(this);
            this._registry = [];
        },
        add: function(Widget, selector) {
            var registryInfo = {
                Widget: Widget,
                selector: selector,
            };
            this._registry.push(registryInfo);
            this.trigger_up('registry_update', registryInfo);
        },
        get: function() {
            return this._registry;
        },
    });
    var PublicWidget = Widget.extend({
        selector: false,
        events: {},
        init: function(parent, options) {
            this._super.apply(this, arguments);
            this.options = options || {};
        },
        destroy: function() {
            if (this.selector) {
                var $oldel = this.$el;
                this.setElement(null);
            }
            this._super.apply(this, arguments);
            if (this.selector) {
                this.$el = $oldel;
                this.el = $oldel[0];
                this.$target = this.$el;
                this.target = this.el;
            }
        },
        setElement: function() {
            this._super.apply(this, arguments);
            if (this.selector) {
                this.$target = this.$el;
                this.target = this.el;
            }
        },
        _delegateEvents: function() {
            var self = this;
            var originalEvents = this.events;
            var events = {};
            _.each(this.events, function(method, event) {
                if (typeof method !== 'string') {
                    events[event] = method;
                    return;
                }
                var methodOptions = method.split(' ');
                if (methodOptions.length <= 1) {
                    events[event] = method;
                    return;
                }
                var isAsync = _.contains(methodOptions, 'async');
                if (!isAsync) {
                    events[event] = method;
                    return;
                }
                method = self.proxy(methodOptions[methodOptions.length - 1]);
                if (_.str.startsWith(event, 'click')) {
                    method = dom.makeButtonHandler(method);
                } else {
                    method = dom.makeAsyncHandler(method);
                }
                events[event] = method;
            });
            this.events = events;
            this._super.apply(this, arguments);
            this.events = originalEvents;
        },
        _getContext: function(extra, extraContext) {
            var context;
            this.trigger_up('context_get', {
                extra: extra || false,
                context: extraContext,
                callback: function(ctx) {
                    context = ctx;
                },
            });
            return context;
        },
    });
    var registry = {};
    registry._fixAppleCollapse = PublicWidget.extend({
        selector: 'div[data-toggle="collapse"]',
        events: {
            'click': function() {},
        },
    });
    return {
        RootWidget: RootWidget,
        RootWidgetRegistry: RootWidgetRegistry,
        Widget: PublicWidget,
        registry: registry,
    };
});
;
/* /web_editor/static/src/js/frontend/loader.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('web_editor.loader', function(require) {
    'use strict';
    var Wysiwyg = require('web_editor.wysiwyg.root');
    function load(parent, textarea, options) {
        var loading = textarea.nextElementSibling;
        if (loading && !loading.classList.contains('o_wysiwyg_loading')) {
            loading = null;
        }
        if (!textarea.value.match(/\S/)) {
            textarea.value = '<p><br/></p>';
        }
        var wysiwyg = new Wysiwyg(parent,options);
        return wysiwyg.attachTo(textarea).then( () => {
            if (loading) {
                loading.parentNode.removeChild(loading);
            }
            return wysiwyg;
        }
        );
    }
    return {
        load: load,
    };
});
;
/* /portal/static/src/js/portal.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('portal.portal', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    const Dialog = require('web.Dialog');
    const {_t, qweb} = require('web.core');
    const ajax = require('web.ajax');
    publicWidget.registry.portalDetails = publicWidget.Widget.extend({
        selector: '.o_portal_details',
        events: {
            'change select[name="country_id"]': '_onCountryChange',
        },
        start: function() {
            var def = this._super.apply(this, arguments);
            this.$state = this.$('select[name="state_id"]');
            this.$stateOptions = this.$state.filter(':enabled').find('option:not(:first)');
            this._adaptAddressForm();
            return def;
        },
        _adaptAddressForm: function() {
            var $country = this.$('select[name="country_id"]');
            var countryID = ($country.val() || 0);
            this.$stateOptions.detach();
            var $displayedState = this.$stateOptions.filter('[data-country_id=' + countryID + ']');
            var nb = $displayedState.appendTo(this.$state).show().length;
            this.$state.parent().toggle(nb >= 1);
        },
        _onCountryChange: function() {
            this._adaptAddressForm();
        },
    });
    publicWidget.registry.PortalHomeCounters = publicWidget.Widget.extend({
        selector: '.o_portal_my_home',
        start: function() {
            var def = this._super.apply(this, arguments);
            this._updateCounters();
            return def;
        },
        async _updateCounters(elem) {
            const numberRpc = 3;
            const needed = this.$('[data-placeholder_count]').map( (i, o) => $(o).data('placeholder_count')).toArray();
            const counterByRpc = Math.ceil(needed.length / numberRpc);
            const proms = [...Array(Math.min(numberRpc, needed.length)).keys()].map(async i => {
                await this._rpc({
                    route: "/my/counters",
                    params: {
                        counters: needed.slice(i * counterByRpc, (i + 1) * counterByRpc)
                    },
                }).then(data => {
                    Object.keys(data).map(k => this.$("[data-placeholder_count='" + k + "']").text(data[k]));
                }
                );
            }
            );
            return Promise.all(proms);
        },
    });
    publicWidget.registry.portalSearchPanel = publicWidget.Widget.extend({
        selector: '.o_portal_search_panel',
        events: {
            'click .search-submit': '_onSearchSubmitClick',
            'click .dropdown-item': '_onDropdownItemClick',
            'keyup input[name="search"]': '_onSearchInputKeyup',
        },
        start: function() {
            var def = this._super.apply(this, arguments);
            this._adaptSearchLabel(this.$('.dropdown-item.active'));
            return def;
        },
        _adaptSearchLabel: function(elem) {
            var $label = $(elem).clone();
            $label.find('span.nolabel').remove();
            this.$('input[name="search"]').attr('placeholder', $label.text().trim());
        },
        _search: function() {
            var search = $.deparam(window.location.search.substring(1));
            search['search_in'] = this.$('.dropdown-item.active').attr('href').replace('#', '');
            search['search'] = this.$('input[name="search"]').val();
            window.location.search = $.param(search);
        },
        _onSearchSubmitClick: function() {
            this._search();
        },
        _onDropdownItemClick: function(ev) {
            ev.preventDefault();
            var $item = $(ev.currentTarget);
            $item.closest('.dropdown-menu').find('.dropdown-item').removeClass('active');
            $item.addClass('active');
            this._adaptSearchLabel(ev.currentTarget);
        },
        _onSearchInputKeyup: function(ev) {
            if (ev.keyCode === $.ui.keyCode.ENTER) {
                this._search();
            }
        },
    });
    function handleCheckIdentity(rpc, wrapped) {
        return wrapped.then( (r) => {
            if (!_.isMatch(r, {
                type: 'ir.actions.act_window',
                res_model: 'res.users.identitycheck'
            })) {
                return r;
            }
            const check_id = r.res_id;
            return ajax.loadXML('/portal/static/src/xml/portal_security.xml', qweb).then( () => new Promise( (resolve, reject) => {
                const d = new Dialog(null,{
                    title: _t("Security Control"),
                    $content: qweb.render('portal.identitycheck'),
                    buttons: [{
                        text: _t("Confirm Password"),
                        classes: 'btn btn-primary',
                        click() {
                            const password_input = this.el.querySelector('[name=password]');
                            if (!password_input.reportValidity()) {
                                password_input.classList.add('is-invalid');
                                return;
                            }
                            return rpc({
                                model: 'res.users.identitycheck',
                                method: 'write',
                                args: [check_id, {
                                    password: password_input.value
                                }]
                            }).then( () => rpc({
                                model: 'res.users.identitycheck',
                                method: 'run_check',
                                args: [check_id]
                            })).then( (r) => {
                                this.close();
                                resolve(r);
                            }
                            , (err) => {
                                err.event.preventDefault();
                                password_input.classList.add('is-invalid');
                                password_input.setCustomValidity(_t("Check failed"));
                                password_input.reportValidity();
                            }
                            );
                        }
                    }, {
                        text: _t('Cancel'),
                        close: true
                    }, {
                        text: _t('Forgot password?'),
                        classes: 'btn btn-link',
                        click() {
                            window.location.href = "/web/reset_password/";
                        }
                    }]
                }).on('close', null, () => {
                    reject();
                }
                );
                d.opened( () => {
                    const pw = d.el.querySelector('[name="password"]');
                    pw.focus();
                    pw.addEventListener('input', () => {
                        pw.classList.remove('is-invalid');
                        pw.setCustomValidity('');
                    }
                    );
                    d.el.addEventListener('submit', (e) => {
                        e.preventDefault();
                        d.$footer.find('.btn-primary').click();
                    }
                    );
                }
                );
                d.open();
            }
            ));
        }
        );
    }
    return {
        handleCheckIdentity,
    }
});
;
/* /portal/static/src/js/portal_chatter.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('portal.chatter', function(require) {
    'use strict';
    var core = require('web.core');
    const dom = require('web.dom');
    var publicWidget = require('web.public.widget');
    var time = require('web.time');
    var portalComposer = require('portal.composer');
    var qweb = core.qweb;
    var _t = core._t;
    var PortalChatter = publicWidget.Widget.extend({
        template: 'portal.Chatter',
        xmlDependencies: ['/portal/static/src/xml/portal_chatter.xml'],
        events: {
            'click .o_portal_chatter_pager_btn': '_onClickPager',
            'click .o_portal_chatter_js_is_internal': 'async _onClickUpdateIsInternal',
        },
        init: function(parent, options) {
            var self = this;
            this.options = {};
            this._super.apply(this, arguments);
            _.each(options, function(val, key) {
                self.options[_.str.underscored(key)] = val;
            });
            this.options = _.defaults(this.options, {
                'allow_composer': true,
                'display_composer': false,
                'csrf_token': odoo.csrf_token,
                'message_count': 0,
                'pager_step': 10,
                'pager_scope': 5,
                'pager_start': 1,
                'is_user_public': true,
                'is_user_employee': false,
                'is_user_publisher': false,
                'hash': false,
                'pid': false,
                'domain': [],
            });
            this.set('messages', []);
            this.set('message_count', this.options['message_count']);
            this.set('pager', {});
            this.set('domain', this.options['domain']);
            this._currentPage = this.options['pager_start'];
        },
        willStart: function() {
            return Promise.all([this._super.apply(this, arguments), this._chatterInit()]);
        },
        start: function() {
            this.on("change:messages", this, this._renderMessages);
            this.on("change:message_count", this, function() {
                this._renderMessageCount();
                this.set('pager', this._pager(this._currentPage));
            });
            this.on("change:pager", this, this._renderPager);
            this.on("change:domain", this, this._onChangeDomain);
            this.set('message_count', this.options['message_count']);
            this.set('messages', this.preprocessMessages(this.result['messages']));
            var defs = [];
            defs.push(this._super.apply(this, arguments));
            if (this.options['display_composer']) {
                this._composer = new portalComposer.PortalComposer(this,this.options);
                defs.push(this._composer.replace(this.$('.o_portal_chatter_composer')));
            }
            return Promise.all(defs);
        },
        messageFetch: function(domain) {
            var self = this;
            return this._rpc({
                route: '/mail/chatter_fetch',
                params: self._messageFetchPrepareParams(),
            }).then(function(result) {
                self.set('messages', self.preprocessMessages(result['messages']));
                self.set('message_count', result['message_count']);
            });
        },
        preprocessMessages: function(messages) {
            _.each(messages, function(m) {
                m['author_avatar_url'] = _.str.sprintf('/web/image/%s/%s/author_avatar/50x50', 'mail.message', m.id);
                m['published_date_str'] = _.str.sprintf(_t('Published on %s'), moment(time.str_to_datetime(m.date)).format('MMMM Do YYYY, h:mm:ss a'));
            });
            return messages;
        },
        _chatterInit: function() {
            var self = this;
            return this._rpc({
                route: '/mail/chatter_init',
                params: this._messageFetchPrepareParams()
            }).then(function(result) {
                self.result = result;
                self.options = _.extend(self.options, self.result['options'] || {});
                return result;
            });
        },
        _changeCurrentPage: function(page, domain) {
            this._currentPage = page;
            var d = domain ? domain : _.clone(this.get('domain'));
            this.set('domain', d);
        },
        _messageFetchPrepareParams: function() {
            var self = this;
            var data = {
                'res_model': this.options['res_model'],
                'res_id': this.options['res_id'],
                'limit': this.options['pager_step'],
                'offset': (this._currentPage - 1) * this.options['pager_step'],
                'allow_composer': this.options['allow_composer'],
            };
            if (self.options['token']) {
                data['token'] = self.options['token'];
            }
            if (this.get('domain')) {
                data['domain'] = this.get('domain');
            }
            return data;
        },
        _pager: function(page) {
            page = page || 1;
            var total = this.get('message_count');
            var scope = this.options['pager_scope'];
            var step = this.options['pager_step'];
            var pageCount = Math.ceil(parseFloat(total) / step);
            page = Math.max(1, Math.min(parseInt(page), pageCount));
            scope -= 1;
            var pmin = Math.max(page - parseInt(Math.floor(scope / 2)), 1);
            var pmax = Math.min(pmin + scope, pageCount);
            if (pmax - scope > 0) {
                pmin = pmax - scope;
            } else {
                pmin = 1;
            }
            var pages = [];
            _.each(_.range(pmin, pmax + 1), function(index) {
                pages.push(index);
            });
            return {
                "page_count": pageCount,
                "offset": (page - 1) * step,
                "page": page,
                "page_start": pmin,
                "page_previous": Math.max(pmin, page - 1),
                "page_next": Math.min(pmax, page + 1),
                "page_end": pmax,
                "pages": pages
            };
        },
        _renderMessages: function() {
            this.$('.o_portal_chatter_messages').html(qweb.render("portal.chatter_messages", {
                widget: this
            }));
        },
        _renderMessageCount: function() {
            this.$('.o_message_counter').replaceWith(qweb.render("portal.chatter_message_count", {
                widget: this
            }));
        },
        _renderPager: function() {
            this.$('.o_portal_chatter_pager').replaceWith(qweb.render("portal.pager", {
                widget: this
            }));
        },
        _onChangeDomain: function() {
            var self = this;
            this.messageFetch().then(function() {
                var p = self._currentPage;
                self.set('pager', self._pager(p));
            });
        },
        _onClickPager: function(ev) {
            ev.preventDefault();
            var page = $(ev.currentTarget).data('page');
            this._changeCurrentPage(page);
        },
        _onClickUpdateIsInternal: function(ev) {
            ev.preventDefault();
            var $elem = $(ev.currentTarget);
            return this._rpc({
                route: '/mail/update_is_internal',
                params: {
                    message_id: $elem.data('message-id'),
                    is_internal: !$elem.data('is-internal'),
                },
            }).then(function(result) {
                $elem.data('is-internal', result);
                if (result === true) {
                    $elem.addClass('o_portal_message_internal_on');
                    $elem.removeClass('o_portal_message_internal_off');
                } else {
                    $elem.addClass('o_portal_message_internal_off');
                    $elem.removeClass('o_portal_message_internal_on');
                }
            });
        },
    });
    publicWidget.registry.portalChatter = publicWidget.Widget.extend({
        selector: '.o_portal_chatter',
        async start() {
            const proms = [this._super.apply(this, arguments)];
            const chatter = new PortalChatter(this,this.$el.data());
            proms.push(chatter.appendTo(this.$el));
            await Promise.all(proms);
            if (window.location.hash === `#${this.el.id}`) {
                dom.scrollTo(this.el, {
                    duration: 0
                });
            }
        },
    });
    return {
        PortalChatter: PortalChatter,
    };
});
;
/* /portal/static/src/js/portal_composer.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('portal.composer', function(require) {
    'use strict';
    var ajax = require('web.ajax');
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var qweb = core.qweb;
    var _t = core._t;
    var PortalComposer = publicWidget.Widget.extend({
        template: 'portal.Composer',
        xmlDependencies: ['/portal/static/src/xml/portal_chatter.xml'],
        events: {
            'change .o_portal_chatter_file_input': '_onFileInputChange',
            'click .o_portal_chatter_attachment_btn': '_onAttachmentButtonClick',
            'click .o_portal_chatter_attachment_delete': 'async _onAttachmentDeleteClick',
            'click .o_portal_chatter_composer_btn': 'async _onSubmitButtonClick',
        },
        init: function(parent, options) {
            this._super.apply(this, arguments);
            this.options = _.defaults(options || {}, {
                'allow_composer': true,
                'display_composer': false,
                'csrf_token': odoo.csrf_token,
                'token': false,
                'res_model': false,
                'res_id': false,
            });
            this.attachments = [];
        },
        start: function() {
            var self = this;
            this.$attachmentButton = this.$('.o_portal_chatter_attachment_btn');
            this.$fileInput = this.$('.o_portal_chatter_file_input');
            this.$sendButton = this.$('.o_portal_chatter_composer_btn');
            this.$attachments = this.$('.o_portal_chatter_composer_form .o_portal_chatter_attachments');
            this.$attachmentIds = this.$('.o_portal_chatter_attachment_ids');
            this.$attachmentTokens = this.$('.o_portal_chatter_attachment_tokens');
            return this._super.apply(this, arguments).then(function() {
                if (self.options.default_attachment_ids) {
                    self.attachments = self.options.default_attachment_ids || [];
                    _.each(self.attachments, function(attachment) {
                        attachment.state = 'done';
                    });
                    self._updateAttachments();
                }
                return Promise.resolve();
            });
        },
        _onAttachmentButtonClick: function() {
            this.$fileInput.click();
        },
        _onAttachmentDeleteClick: function(ev) {
            var self = this;
            var attachmentId = $(ev.currentTarget).closest('.o_portal_chatter_attachment').data('id');
            var accessToken = _.find(this.attachments, {
                'id': attachmentId
            }).access_token;
            ev.preventDefault();
            ev.stopPropagation();
            this.$sendButton.prop('disabled', true);
            return this._rpc({
                route: '/portal/attachment/remove',
                params: {
                    'attachment_id': attachmentId,
                    'access_token': accessToken,
                },
            }).then(function() {
                self.attachments = _.reject(self.attachments, {
                    'id': attachmentId
                });
                self._updateAttachments();
                self.$sendButton.prop('disabled', false);
            });
        },
        _onFileInputChange: function() {
            var self = this;
            this.$sendButton.prop('disabled', true);
            return Promise.all(_.map(this.$fileInput[0].files, function(file) {
                return new Promise(function(resolve, reject) {
                    var data = {
                        'name': file.name,
                        'file': file,
                        'res_id': self.options.res_id,
                        'res_model': self.options.res_model,
                        'access_token': self.options.token,
                    };
                    ajax.post('/portal/attachment/add', data).then(function(attachment) {
                        attachment.state = 'pending';
                        self.attachments.push(attachment);
                        self._updateAttachments();
                        resolve();
                    }).guardedCatch(function(error) {
                        self.displayNotification({
                            message: _.str.sprintf(_t("Could not save file <strong>%s</strong>"), _.escape(file.name)),
                            type: 'warning',
                            sticky: true,
                        });
                        resolve();
                    });
                }
                );
            })).then(function() {
                self.$fileInput[0].value = null;
                self.$sendButton.prop('disabled', false);
            });
        },
        _onSubmitButtonClick: function() {
            return new Promise(function(resolve, reject) {}
            );
        },
        _updateAttachments: function() {
            this.$attachmentIds.val(_.pluck(this.attachments, 'id'));
            this.$attachmentTokens.val(_.pluck(this.attachments, 'access_token'));
            this.$attachments.html(qweb.render('portal.Chatter.Attachments', {
                attachments: this.attachments,
                showDelete: true,
            }));
        },
    });
    return {
        PortalComposer: PortalComposer,
    };
});
;
/* /portal/static/src/js/portal_signature.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('portal.signature_form', function(require) {
    'use strict';
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var NameAndSignature = require('web.name_and_signature').NameAndSignature;
    var qweb = core.qweb;
    var _t = core._t;
    var SignatureForm = publicWidget.Widget.extend({
        template: 'portal.portal_signature',
        xmlDependencies: ['/portal/static/src/xml/portal_signature.xml'],
        events: {
            'click .o_portal_sign_submit': 'async _onClickSignSubmit',
        },
        custom_events: {
            'signature_changed': '_onChangeSignature',
        },
        init: function(parent, options) {
            this._super.apply(this, arguments);
            this.csrf_token = odoo.csrf_token;
            this.callUrl = options.callUrl || '';
            this.rpcParams = options.rpcParams || {};
            this.sendLabel = options.sendLabel || _t("Accept & Sign");
            this.nameAndSignature = new NameAndSignature(this,options.nameAndSignatureOptions || {});
        },
        start: function() {
            var self = this;
            this.$confirm_btn = this.$('.o_portal_sign_submit');
            this.$controls = this.$('.o_portal_sign_controls');
            var subWidgetStart = this.nameAndSignature.replace(this.$('.o_web_sign_name_and_signature'));
            return Promise.all([subWidgetStart, this._super.apply(this, arguments)]).then(function() {
                self.nameAndSignature.resetSignature();
            });
        },
        focusName: function() {
            this.nameAndSignature.focusName();
        },
        resetSignature: function() {
            return this.nameAndSignature.resetSignature();
        },
        _onClickSignSubmit: function(ev) {
            var self = this;
            ev.preventDefault();
            if (!this.nameAndSignature.validateSignature()) {
                return;
            }
            var name = this.nameAndSignature.getName();
            var signature = this.nameAndSignature.getSignatureImage()[1];
            return this._rpc({
                route: this.callUrl,
                params: _.extend(this.rpcParams, {
                    'name': name,
                    'signature': signature,
                }),
            }).then(function(data) {
                if (data.error) {
                    self.$('.o_portal_sign_error_msg').remove();
                    self.$controls.prepend(qweb.render('portal.portal_signature_error', {
                        widget: data
                    }));
                } else if (data.success) {
                    var $success = qweb.render('portal.portal_signature_success', {
                        widget: data
                    });
                    self.$el.empty().append($success);
                }
                if (data.force_refresh) {
                    if (data.redirect_url) {
                        window.location = data.redirect_url;
                    } else {
                        window.location.reload();
                    }
                    return new Promise(function() {}
                    );
                }
            });
        },
        _onChangeSignature: function() {
            var isEmpty = this.nameAndSignature.isSignatureEmpty();
            this.$confirm_btn.prop('disabled', isEmpty);
        },
    });
    publicWidget.registry.SignatureForm = publicWidget.Widget.extend({
        selector: '.o_portal_signature_form',
        start: function() {
            var hasBeenReset = false;
            var callUrl = this.$el.data('call-url');
            var nameAndSignatureOptions = {
                defaultName: this.$el.data('default-name'),
                mode: this.$el.data('mode'),
                displaySignatureRatio: this.$el.data('signature-ratio'),
                signatureType: this.$el.data('signature-type'),
                fontColor: this.$el.data('font-color') || 'black',
            };
            var sendLabel = this.$el.data('send-label');
            var form = new SignatureForm(this,{
                callUrl: callUrl,
                nameAndSignatureOptions: nameAndSignatureOptions,
                sendLabel: sendLabel,
            });
            this.$el.closest('.modal').on('shown.bs.modal', function(ev) {
                if (!hasBeenReset) {
                    hasBeenReset = true;
                    form.resetSignature();
                } else {
                    form.focusName();
                }
            });
            return Promise.all([this._super.apply(this, arguments), form.appendTo(this.$el)]);
        },
    });
    return {
        SignatureForm: SignatureForm,
    };
});
;
/* /portal/static/src/js/portal_sidebar.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('portal.PortalSidebar', function(require) {
    'use strict';
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var time = require('web.time');
    var session = require('web.session');
    var _t = core._t;
    var PortalSidebar = publicWidget.Widget.extend({
        start: function() {
            this._setDelayLabel();
            return this._super.apply(this, arguments);
        },
        _setDelayLabel: function() {
            var $sidebarTimeago = this.$el.find('.o_portal_sidebar_timeago');
            _.each($sidebarTimeago, function(el) {
                var dateTime = moment(time.auto_str_to_date($(el).attr('datetime'))), today = moment().startOf('day'), diff = dateTime.diff(today, 'days', true), displayStr;
                session.is_bound.then(function() {
                    if (diff === 0) {
                        displayStr = _t('Due today');
                    } else if (diff > 0) {
                        displayStr = _.str.sprintf(_t('Due in %1d days'), Math.abs(diff));
                    } else {
                        displayStr = _.str.sprintf(_t('%1d days overdue'), Math.abs(diff));
                    }
                    $(el).text(displayStr);
                });
            });
        },
        _printIframeContent: function(href) {
            if ($.browser.mozilla) {
                window.open(href, '_blank');
                return;
            }
            if (!this.printContent) {
                this.printContent = $('<iframe id="print_iframe_content" src="' + href + '" style="display:none"></iframe>');
                this.$el.append(this.printContent);
                this.printContent.on('load', function() {
                    $(this).get(0).contentWindow.print();
                });
            } else {
                this.printContent.get(0).contentWindow.print();
            }
        },
    });
    return PortalSidebar;
});
;
/* /auth_totp_portal/static/src/js/totp_frontend.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('auth_totp_portal.button', function(require) {
    'use strict';
    const {_t} = require('web.core');
    const publicWidget = require('web.public.widget');
    const Dialog = require('web.Dialog');
    const {handleCheckIdentity} = require('portal.portal');
    function fromField(f, record) {
        switch (f.getAttribute('name')) {
        case 'qrcode':
            const qrcode = document.createElement('img');
            qrcode.setAttribute('class', 'img img-fluid offset-1');
            qrcode.setAttribute('src', 'data:image/png;base64,' + record['qrcode']);
            return qrcode;
        case 'url':
            const url = document.createElement('a');
            url.setAttribute('href', record['url']);
            url.textContent = f.getAttribute('text') || record['url'];
            return url;
        case 'code':
            const code = document.createElement('input');
            code.setAttribute('name', 'code');
            code.setAttribute('class', 'form-control col-10 col-md-6');
            code.setAttribute('placeholder', '6-digit code');
            code.required = true;
            code.maxLength = 6;
            code.minLength = 6;
            return code;
        default:
            return document.createTextNode(record[f.getAttribute('name')] || '');
        }
    }
    function fixupViewBody(oldNode, record) {
        let qrcode = null
          , code = null
          , node = null;
        switch (oldNode.nodeType) {
        case 1:
            if (oldNode.tagName === 'field') {
                node = fromField(oldNode, record);
                switch (oldNode.getAttribute('name')) {
                case 'qrcode':
                    qrcode = node;
                    break;
                case 'code':
                    code = node;
                    break
                }
                break;
            }
            node = document.createElement(oldNode.tagName);
            for (let i = 0; i < oldNode.attributes.length; ++i) {
                const attr = oldNode.attributes[i];
                node.setAttribute(attr.name, attr.value);
            }
            for (let j = 0; j < oldNode.childNodes.length; ++j) {
                const [ch,qr,co] = fixupViewBody(oldNode.childNodes[j], record);
                if (ch) {
                    node.appendChild(ch);
                }
                if (qr) {
                    qrcode = qr;
                }
                if (co) {
                    code = co;
                }
            }
            break;
        case 3:
        case 4:
            node = document.createTextNode(oldNode.data);
            break;
        default:
        }
        return [node, qrcode, code]
    }
    class Button {
        constructor(parent, model, record_id, input_node, button_node) {
            this._parent = parent;
            this.model = model;
            this.record_id = record_id;
            this.input = input_node;
            this.text = button_node.getAttribute('string');
            this.classes = button_node.getAttribute('class') || null;
            this.action = button_node.getAttribute('name');
            if (button_node.getAttribute('special') === 'cancel') {
                this.close = true;
                this.click = null;
            } else {
                this.close = false;
                this.click = this._click.bind(this);
            }
        }
        async _click() {
            if (!this.input.reportValidity()) {
                this.input.classList.add('is-invalid');
                return;
            }
            try {
                await this.callAction(this.record_id, {
                    code: this.input.value
                });
            } catch (e) {
                this.input.classList.add('is-invalid');
                this.input.setCustomValidity(e.message);
                this.input.reportValidity();
                return;
            }
            this.input.classList.remove('is-invalid');
            window.location = window.location;
        }
        async callAction(id, update) {
            try {
                await this._parent._rpc({
                    model: this.model,
                    method: 'write',
                    args: [id, update]
                });
                await handleCheckIdentity(this._parent.proxy('_rpc'), this._parent._rpc({
                    model: this.model,
                    method: this.action,
                    args: [id]
                }));
            } catch (e) {
                e.event.preventDefault();
                throw new Error(!e.message ? e.toString() : !e.message.data ? e.message.message : e.message.data.message || _t("Operation failed for unknown reason."));
            }
        }
    }
    publicWidget.registry.TOTPButton = publicWidget.Widget.extend({
        selector: '#auth_totp_portal_enable',
        events: {
            click: '_onClick',
        },
        async _onClick(e) {
            e.preventDefault();
            const w = await handleCheckIdentity(this.proxy('_rpc'), this._rpc({
                model: 'res.users',
                method: 'totp_enable_wizard',
                args: [this.getSession().user_id]
            }));
            if (!w) {
                window.location = window.location;
                return;
            }
            const {res_model: model, res_id: wizard_id} = w;
            const record = await this._rpc({
                model,
                method: 'read',
                args: [wizard_id, []]
            }).then(ar => ar[0]);
            const doc = new DOMParser().parseFromString(document.getElementById('totp_wizard_view').textContent, 'application/xhtml+xml');
            const xmlBody = doc.querySelector('sheet *');
            const [body,,codeInput] = fixupViewBody(xmlBody, record);
            codeInput.addEventListener('input', () => codeInput.setCustomValidity(''));
            const buttons = [];
            for (const button of doc.querySelectorAll('footer button')) {
                buttons.push(new Button(this,model,record.id,codeInput,button));
            }
            const $content = document.createElement('form');
            $content.appendChild(body);
            $content.addEventListener('submit', (e) => {
                e.preventDefault();
                dialog.$footer.find('.btn-primary').click();
            }
            );
            var dialog = new Dialog(this,{
                $content,
                buttons
            }).open();
        }
    });
    publicWidget.registry.DisableTOTPButton = publicWidget.Widget.extend({
        selector: '#auth_totp_portal_disable',
        events: {
            click: '_onClick'
        },
        async _onClick(e) {
            e.preventDefault();
            await handleCheckIdentity(this.proxy('_rpc'), this._rpc({
                model: 'res.users',
                method: 'totp_disable',
                args: [this.getSession().user_id]
            }))
            window.location = window.location;
        }
    });
    publicWidget.registry.RevokeTrustedDeviceButton = publicWidget.Widget.extend({
        selector: '.fa.fa-trash.text-danger',
        events: {
            click: '_onClick'
        },
        async _onClick(e) {
            e.preventDefault();
            await handleCheckIdentity(this.proxy('_rpc'), this._rpc({
                model: 'res.users.apikeys',
                method: 'remove',
                args: [parseInt(this.target.id)]
            }));
            window.location = window.location;
        }
    });
    publicWidget.registry.RevokeAllTrustedDevicesButton = publicWidget.Widget.extend({
        selector: '#auth_totp_portal_revoke_all_devices',
        events: {
            click: '_onClick'
        },
        async _onClick(e) {
            e.preventDefault();
            await handleCheckIdentity(this.proxy('_rpc'), this._rpc({
                model: 'res.users',
                method: 'revoke_all_devices',
                args: [this.getSession().user_id]
            }));
            window.location = window.location;
        }
    });
});
;
/* /website/static/src/js/utils.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.utils', function(require) {
    'use strict';
    var ajax = require('web.ajax');
    var core = require('web.core');
    var qweb = core.qweb;
    function loadAnchors(url) {
        return new Promise(function(resolve, reject) {
            if (url === window.location.pathname || url[0] === '#') {
                resolve(document.body.outerHTML);
            } else if (url.length && !url.startsWith("http")) {
                $.get(window.location.origin + url).then(resolve, reject);
            } else {
                resolve();
            }
        }
        ).then(function(response) {
            return _.map($(response).find('[id][data-anchor=true]'), function(el) {
                return '#' + el.id;
            });
        }).catch(error => {
            console.debug(error);
            return [];
        }
        );
    }
    function autocompleteWithPages(self, $input, options) {
        $.widget("website.urlcomplete", $.ui.autocomplete, {
            options: options || {},
            _create: function() {
                this._super();
                this.widget().menu("option", "items", "> :not(.ui-autocomplete-category)");
            },
            _renderMenu: function(ul, items) {
                const self = this;
                items.forEach(item => {
                    if (item.separator) {
                        self._renderSeparator(ul, item);
                    } else {
                        self._renderItem(ul, item);
                    }
                }
                );
            },
            _renderSeparator: function(ul, item) {
                return $("<li class='ui-autocomplete-category font-weight-bold text-capitalize p-2'>").append(`<div>${item.separator}</div>`).appendTo(ul);
            },
            _renderItem: function(ul, item) {
                return $("<li>").data('ui-autocomplete-item', item).append(`<div>${item.label}</div>`).appendTo(ul);
            },
        });
        $input.urlcomplete({
            source: function(request, response) {
                if (request.term[0] === '#') {
                    loadAnchors(request.term).then(function(anchors) {
                        response(anchors);
                    });
                } else if (request.term.startsWith('http') || request.term.length === 0) {
                    response();
                } else {
                    return self._rpc({
                        route: '/website/get_suggested_links',
                        params: {
                            needle: request.term,
                            limit: 15,
                        }
                    }).then(function(res) {
                        let choices = res.matching_pages;
                        res.others.forEach(other => {
                            if (other.values.length) {
                                choices = choices.concat([{
                                    separator: other.title
                                }], other.values, );
                            }
                        }
                        );
                        response(choices);
                    });
                }
            },
            select: function(ev, ui) {
                ev.target.value = ui.item.value;
                self.trigger_up('website_url_chosen');
                ev.preventDefault();
            },
        });
    }
    function onceAllImagesLoaded($element, $excluded) {
        var defs = _.map($element.find('img').addBack('img'), function(img) {
            if (img.complete || $excluded && ($excluded.is(img) || $excluded.has(img).length)) {
                return;
            }
            var def = new Promise(function(resolve, reject) {
                $(img).one('load', function() {
                    resolve();
                });
            }
            );
            return def;
        });
        return Promise.all(defs);
    }
    function prompt(options, _qweb) {
        if (typeof options === 'string') {
            options = {
                text: options
            };
        }
        var xmlDef;
        if (_.isUndefined(_qweb)) {
            _qweb = 'website.prompt';
            xmlDef = ajax.loadXML('/website/static/src/xml/website.xml', core.qweb);
        }
        options = _.extend({
            window_title: '',
            field_name: '',
            'default': '',
            init: function() {},
        }, options || {});
        var type = _.intersection(Object.keys(options), ['input', 'textarea', 'select']);
        type = type.length ? type[0] : 'input';
        options.field_type = type;
        options.field_name = options.field_name || options[type];
        var def = new Promise(function(resolve, reject) {
            Promise.resolve(xmlDef).then(function() {
                var dialog = $(qweb.render(_qweb, options)).appendTo('body');
                options.$dialog = dialog;
                var field = dialog.find(options.field_type).first();
                field.val(options['default']);
                field.fillWith = function(data) {
                    if (field.is('select')) {
                        var select = field[0];
                        data.forEach(function(item) {
                            select.options[select.options.length] = new window.Option(item[1],item[0]);
                        });
                    } else {
                        field.val(data);
                    }
                }
                ;
                var init = options.init(field, dialog);
                Promise.resolve(init).then(function(fill) {
                    if (fill) {
                        field.fillWith(fill);
                    }
                    dialog.modal('show');
                    field.focus();
                    dialog.on('click', '.btn-primary', function() {
                        var backdrop = $('.modal-backdrop');
                        resolve({
                            val: field.val(),
                            field: field,
                            dialog: dialog
                        });
                        dialog.modal('hide').remove();
                        backdrop.remove();
                    });
                });
                dialog.on('hidden.bs.modal', function() {
                    var backdrop = $('.modal-backdrop');
                    reject();
                    dialog.remove();
                    backdrop.remove();
                });
                if (field.is('input[type="text"], select')) {
                    field.keypress(function(e) {
                        if (e.which === 13) {
                            e.preventDefault();
                            dialog.find('.btn-primary').trigger('click');
                        }
                    });
                }
            });
        }
        );
        return def;
    }
    function websiteDomain(self) {
        var websiteID;
        self.trigger_up('context_get', {
            callback: function(ctx) {
                websiteID = ctx['website_id'];
            },
        });
        return ['|', ['website_id', '=', false], ['website_id', '=', websiteID]];
    }
    function sendRequest(route, params) {
        function _addInput(form, name, value) {
            let param = document.createElement('input');
            param.setAttribute('type', 'hidden');
            param.setAttribute('name', name);
            param.setAttribute('value', value);
            form.appendChild(param);
        }
        let form = document.createElement('form');
        form.setAttribute('action', route);
        form.setAttribute('method', params.method || 'POST');
        if (core.csrf_token) {
            _addInput(form, 'csrf_token', core.csrf_token);
        }
        for (const key in params) {
            const value = params[key];
            if (Array.isArray(value) && value.length) {
                for (const val of value) {
                    _addInput(form, key, val);
                }
            } else {
                _addInput(form, key, value);
            }
        }
        document.body.appendChild(form);
        form.submit();
    }
    function removeLoader() {
        const $loader = $('#o_website_page_loader');
        if ($loader) {
            $loader.remove();
        }
    }
    function svgToPNG(src, noAsync=false) {
        function checkImg(imgEl) {
            return (imgEl.naturalHeight !== 0);
        }
        function toPNGViaCanvas(imgEl) {
            const canvas = document.createElement('canvas');
            canvas.width = imgEl.width;
            canvas.height = imgEl.height;
            canvas.getContext('2d').drawImage(imgEl, 0, 0);
            return canvas.toDataURL('image/png');
        }
        if (src instanceof HTMLImageElement) {
            const loadedImgEl = src;
            if (noAsync || checkImg(loadedImgEl)) {
                return toPNGViaCanvas(loadedImgEl);
            }
            src = loadedImgEl.src;
        }
        return new Promise(resolve => {
            const imgEl = new Image();
            imgEl.onload = () => {
                if (checkImg(imgEl)) {
                    resolve(imgEl);
                    return;
                }
                imgEl.height = 1000;
                imgEl.style.opacity = 0;
                document.body.appendChild(imgEl);
                const request = new XMLHttpRequest();
                request.open('GET', imgEl.src, true);
                request.onload = () => {
                    const parser = new DOMParser();
                    const result = parser.parseFromString(request.responseText, 'text/xml');
                    const svgEl = result.getElementsByTagName("svg")[0];
                    svgEl.setAttribute('width', imgEl.width);
                    svgEl.setAttribute('height', imgEl.height);
                    imgEl.remove();
                    const svg64 = btoa(new XMLSerializer().serializeToString(svgEl));
                    const finalImg = new Image();
                    finalImg.onload = () => {
                        resolve(finalImg);
                    }
                    ;
                    finalImg.src = `data:image/svg+xml;base64,${svg64}`;
                }
                ;
                request.send();
            }
            ;
            imgEl.src = src;
        }
        ).then(loadedImgEl => toPNGViaCanvas(loadedImgEl));
    }
    return {
        loadAnchors: loadAnchors,
        autocompleteWithPages: autocompleteWithPages,
        onceAllImagesLoaded: onceAllImagesLoaded,
        prompt: prompt,
        sendRequest: sendRequest,
        websiteDomain: websiteDomain,
        removeLoader: removeLoader,
        svgToPNG: svgToPNG,
    };
});
;
/* /website/static/src/js/content/website_root.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.root', function(require) {
    'use strict';
    const ajax = require('web.ajax');
    const {_t} = require('web.core');
    var Dialog = require('web.Dialog');
    const KeyboardNavigationMixin = require('web.KeyboardNavigationMixin');
    const session = require('web.session');
    var publicRootData = require('web.public.root');
    require("web.zoomodoo");
    var websiteRootRegistry = publicRootData.publicRootRegistry;
    var WebsiteRoot = publicRootData.PublicRoot.extend(KeyboardNavigationMixin, {
        events: _.extend({}, KeyboardNavigationMixin.events, publicRootData.PublicRoot.prototype.events || {}, {
            'click .js_change_lang': '_onLangChangeClick',
            'click .js_publish_management .js_publish_btn': '_onPublishBtnClick',
            'click .js_multi_website_switch': '_onWebsiteSwitch',
            'shown.bs.modal': '_onModalShown',
        }),
        custom_events: _.extend({}, publicRootData.PublicRoot.prototype.custom_events || {}, {
            'gmap_api_request': '_onGMapAPIRequest',
            'gmap_api_key_request': '_onGMapAPIKeyRequest',
            'ready_to_clean_for_save': '_onWidgetsStopRequest',
            'seo_object_request': '_onSeoObjectRequest',
        }),
        init() {
            this.isFullscreen = false;
            KeyboardNavigationMixin.init.call(this, {
                autoAccessKeys: false,
            });
            return this._super(...arguments);
        },
        start: function() {
            KeyboardNavigationMixin.start.call(this);
            if (!this.$('.js_change_lang').length) {
                var $links = this.$('.js_language_selector a:not([data-oe-id])');
                var m = $(_.min($links, function(l) {
                    return $(l).attr('href').length;
                })).attr('href');
                $links.each(function() {
                    var $link = $(this);
                    var t = $link.attr('href');
                    var l = (t === m) ? "default" : t.split('/')[1];
                    $link.data('lang', l).addClass('js_change_lang');
                });
            }
            this.$('.zoomable img[data-zoom]').zoomOdoo();
            return this._super.apply(this, arguments);
        },
        destroy() {
            KeyboardNavigationMixin.destroy.call(this);
            return this._super(...arguments);
        },
        _getContext: function(context) {
            var html = document.documentElement;
            return _.extend({
                'website_id': html.getAttribute('data-website-id') | 0,
            }, this._super.apply(this, arguments));
        },
        _getExtraContext: function(context) {
            var html = document.documentElement;
            return _.extend({
                'editable': !!(html.dataset.editable || $('[data-oe-model]').length),
                'translatable': !!html.dataset.translatable,
                'edit_translations': !!html.dataset.edit_translations,
            }, this._super.apply(this, arguments));
        },
        async _getGMapAPIKey(refetch) {
            if (refetch || !this._gmapAPIKeyProm) {
                this._gmapAPIKeyProm = new Promise(async resolve => {
                    const data = await this._rpc({
                        route: '/website/google_maps_api_key',
                    });
                    resolve(JSON.parse(data).google_maps_api_key || '');
                }
                );
            }
            return this._gmapAPIKeyProm;
        },
        _getPublicWidgetsRegistry: function(options) {
            var registry = this._super.apply(this, arguments);
            if (options.editableMode) {
                return _.pick(registry, function(PublicWidget) {
                    return !PublicWidget.prototype.disabledInEditableMode;
                });
            }
            return registry;
        },
        async _loadGMapAPI(editableMode, refetch) {
            if (refetch || !this._gmapAPILoading) {
                this._gmapAPILoading = new Promise(async resolve => {
                    const key = await this._getGMapAPIKey(refetch);
                    window.odoo_gmap_api_post_load = (async function odoo_gmap_api_post_load() {
                        await this._startWidgets(undefined, {
                            editableMode: editableMode
                        });
                        resolve(key);
                    }
                    ).bind(this);
                    if (!key) {
                        if (!editableMode && session.is_admin) {
                            this.displayNotification({
                                type: 'warning',
                                sticky: true,
                                message: $('<div/>').append($('<span/>', {
                                    text: _t("Cannot load google map.")
                                }), $('<br/>'), $('<a/>', {
                                    href: "/web#action=website.action_website_configuration",
                                    text: _t("Check your configuration."),
                                }), )[0].outerHTML,
                            });
                        }
                        resolve(false);
                        this._gmapAPILoading = false;
                        return;
                    }
                    await ajax.loadJS(`https://maps.googleapis.com/maps/api/js?v=3.exp&libraries=places&callback=odoo_gmap_api_post_load&key=${key}`);
                }
                );
            }
            return this._gmapAPILoading;
        },
        _toggleFullscreen(state) {
            this.isFullscreen = state;
            document.body.classList.add('o_fullscreen_transition');
            document.body.classList.toggle('o_fullscreen', this.isFullscreen);
            document.body.style.overflowX = 'hidden';
            let resizing = true;
            window.requestAnimationFrame(function resizeFunction() {
                window.dispatchEvent(new Event('resize'));
                if (resizing) {
                    window.requestAnimationFrame(resizeFunction);
                }
            });
            let stopResizing;
            const onTransitionEnd = ev => {
                if (ev.target === document.body && ev.propertyName === 'padding-top') {
                    stopResizing();
                }
            }
            ;
            stopResizing = () => {
                resizing = false;
                document.body.style.overflowX = '';
                document.body.removeEventListener('transitionend', onTransitionEnd);
                document.body.classList.remove('o_fullscreen_transition');
            }
            ;
            document.body.addEventListener('transitionend', onTransitionEnd);
            window.setTimeout( () => stopResizing(), 500);
        },
        _onWidgetsStartRequest: function(ev) {
            ev.data.options = _.clone(ev.data.options || {});
            ev.data.options.editableMode = ev.data.editableMode;
            this._super.apply(this, arguments);
        },
        _onLangChangeClick: function(ev) {
            ev.preventDefault();
            var $target = $(ev.currentTarget);
            var redirect = {
                lang: $target.data('url_code'),
                url: encodeURIComponent($target.attr('href').replace(/[&?]edit_translations[^&?]+/, '')),
                hash: encodeURIComponent(window.location.hash)
            };
            window.location.href = _.str.sprintf("/website/lang/%(lang)s?r=%(url)s%(hash)s", redirect);
        },
        async _onGMapAPIRequest(ev) {
            ev.stopPropagation();
            const apiKey = await this._loadGMapAPI(ev.data.editableMode, ev.data.refetch);
            ev.data.onSuccess(apiKey);
        },
        async _onGMapAPIKeyRequest(ev) {
            ev.stopPropagation();
            const apiKey = await this._getGMapAPIKey(ev.data.refetch);
            ev.data.onSuccess(apiKey);
        },
        _onSeoObjectRequest: function(ev) {
            var res = this._unslugHtmlDataObject('seo-object');
            ev.data.callback(res);
        },
        _unslugHtmlDataObject: function(dataAttr) {
            var repr = $('html').data(dataAttr);
            var match = repr && repr.match(/(.+)\((\d+),(.*)\)/);
            if (!match) {
                return null;
            }
            return {
                model: match[1],
                id: match[2] | 0,
            };
        },
        _onPublishBtnClick: function(ev) {
            ev.preventDefault();
            if (document.body.classList.contains('editor_enable')) {
                return;
            }
            var self = this;
            var $data = $(ev.currentTarget).parents(".js_publish_management:first");
            this._rpc({
                route: $data.data('controller') || '/website/publish',
                params: {
                    id: +$data.data('id'),
                    object: $data.data('object'),
                },
            }).then(function(result) {
                $data.toggleClass("css_unpublished css_published");
                $data.find('input').prop("checked", result);
                $data.parents("[data-publish]").attr("data-publish", +result ? 'on' : 'off');
                if (result) {
                    self.displayNotification({
                        type: 'success',
                        message: $data.data('description') ? _.str.sprintf(_t("You've published your %s."), $data.data('description')) : _t("Published with success."),
                    });
                }
            });
        },
        _onWebsiteSwitch: function(ev) {
            var websiteId = ev.currentTarget.getAttribute('website-id');
            var websiteDomain = ev.currentTarget.getAttribute('domain');
            let url = `/website/force/${websiteId}`;
            if (websiteDomain && window.location.hostname !== websiteDomain) {
                url = websiteDomain + url;
            }
            const path = window.location.pathname + window.location.search + window.location.hash;
            window.location.href = $.param.querystring(url, {
                'path': path
            });
        },
        _onModalShown: function(ev) {
            $(ev.target).addClass('modal_shown');
        },
        _onKeyDown(ev) {
            if (!session.user_id) {
                return;
            }
            if (ev.keyCode !== $.ui.keyCode.ESCAPE || !document.body.contains(ev.target) || ev.target.closest('.modal')) {
                return KeyboardNavigationMixin._onKeyDown.apply(this, arguments);
            }
            this._toggleFullscreen(!this.isFullscreen);
        },
    });
    return {
        WebsiteRoot: WebsiteRoot,
        websiteRootRegistry: websiteRootRegistry,
    };
});
;
/* /website/static/src/js/content/compatibility.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.content.compatibility', function(require) {
    'use strict';
    require('web.dom_ready');
    var browser = _.findKey($.browser, function(v) {
        return v === true;
    });
    if ($.browser.mozilla && +$.browser.version.replace(/^([0-9]+\.[0-9]+).*/, '\$1') < 20) {
        browser = 'msie';
    }
    browser += (',' + $.browser.version);
    var mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    if (mobileRegex.test(window.navigator.userAgent.toLowerCase())) {
        browser += ',mobile';
    }
    document.documentElement.setAttribute('data-browser', browser);
    var htmlStyle = document.documentElement.style;
    var isFlexSupported = (('flexWrap'in htmlStyle) || ('WebkitFlexWrap'in htmlStyle) || ('msFlexWrap'in htmlStyle));
    if (!isFlexSupported) {
        document.documentElement.setAttribute('data-no-flex', '');
    }
    return {
        browser: browser,
        isFlexSupported: isFlexSupported,
    };
});
;
/* /website/static/src/js/content/menu.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.content.menu', function(require) {
    'use strict';
    const config = require('web.config');
    var dom = require('web.dom');
    var publicWidget = require('web.public.widget');
    var wUtils = require('website.utils');
    var animations = require('website.content.snippets.animation');
    const extraMenuUpdateCallbacks = [];
    const BaseAnimatedHeader = animations.Animation.extend({
        disabledInEditableMode: false,
        effects: [{
            startEvents: 'scroll',
            update: '_updateHeaderOnScroll',
        }, {
            startEvents: 'resize',
            update: '_updateHeaderOnResize',
        }],
        init: function() {
            this._super(...arguments);
            this.fixedHeader = false;
            this.scrolledPoint = 0;
            this.hasScrolled = false;
        },
        start: function() {
            this.$main = this.$el.next('main');
            this.isOverlayHeader = !!this.$el.closest('.o_header_overlay, .o_header_overlay_theme').length;
            this.$dropdowns = this.$el.find('.dropdown, .dropdown-menu');
            this.$navbarCollapses = this.$el.find('.navbar-collapse');
            this.$navbarCollapses.on('show.bs.collapse.BaseAnimatedHeader', function() {
                if (config.device.size_class <= config.device.SIZES.SM) {
                    $(document.body).addClass('overflow-hidden');
                }
            }).on('hide.bs.collapse.BaseAnimatedHeader', function() {
                $(document.body).removeClass('overflow-hidden');
            });
            this._transitionCount = 0;
            this.$el.on('odoo-transitionstart.BaseAnimatedHeader', () => this._adaptToHeaderChangeLoop(1));
            this.$el.on('transitionend.BaseAnimatedHeader', () => this._adaptToHeaderChangeLoop(-1));
            return this._super(...arguments);
        },
        destroy: function() {
            this._toggleFixedHeader(false);
            this.$el.removeClass('o_header_affixed o_header_is_scrolled o_header_no_transition');
            this.$navbarCollapses.off('.BaseAnimatedHeader');
            this.$el.off('.BaseAnimatedHeader');
            this._super(...arguments);
        },
        _adaptFixedHeaderPosition() {
            dom.compensateScrollbar(this.el, this.fixedHeader, false, 'right');
        },
        _adaptToHeaderChange: function() {
            this._updateMainPaddingTop();
            this.el.classList.toggle('o_top_fixed_element', this.fixedHeader && this._isShown());
            for (const callback of extraMenuUpdateCallbacks) {
                callback();
            }
        },
        _adaptToHeaderChangeLoop: function(addCount=0) {
            this._adaptToHeaderChange();
            this._transitionCount += addCount;
            this._transitionCount = Math.max(0, this._transitionCount);
            if (this._transitionCount > 0) {
                window.requestAnimationFrame( () => this._adaptToHeaderChangeLoop());
                if (addCount !== 0) {
                    clearTimeout(this._changeLoopTimer);
                    this._changeLoopTimer = setTimeout( () => {
                        this._adaptToHeaderChangeLoop(-this._transitionCount);
                    }
                    , 500);
                }
            } else {
                clearTimeout(this._changeLoopTimer);
            }
        },
        _computeTopGap() {
            return 0;
        },
        _isShown() {
            return true;
        },
        _toggleFixedHeader: function(useFixed=true) {
            this.fixedHeader = useFixed;
            this._adaptToHeaderChange();
            this.el.classList.toggle('o_header_affixed', useFixed);
            this._adaptFixedHeaderPosition();
        },
        _updateMainPaddingTop: function() {
            this.headerHeight = this.$el.outerHeight();
            this.topGap = this._computeTopGap();
            if (this.isOverlayHeader) {
                return;
            }
            this.$main.css('padding-top', this.fixedHeader ? this.headerHeight : '');
        },
        _updateHeaderOnScroll: function(scroll) {
            if (!this.hasScrolled) {
                this.hasScrolled = true;
                if (scroll > 0) {
                    this.$el.addClass('o_header_no_transition');
                }
            } else {
                this.$el.removeClass('o_header_no_transition');
            }
            const headerIsScrolled = (scroll > this.scrolledPoint);
            if (this.headerIsScrolled !== headerIsScrolled) {
                this.el.classList.toggle('o_header_is_scrolled', headerIsScrolled);
                this.$el.trigger('odoo-transitionstart');
                this.headerIsScrolled = headerIsScrolled;
            }
            this.$dropdowns.removeClass('show');
            this.$navbarCollapses.removeClass('show').attr('aria-expanded', false);
        },
        _updateHeaderOnResize: function() {
            this._adaptFixedHeaderPosition();
            if (document.body.classList.contains('overflow-hidden') && config.device.size_class > config.device.SIZES.SM) {
                document.body.classList.remove('overflow-hidden');
                this.$el.find('.navbar-collapse').removeClass('show');
            }
        },
    });
    publicWidget.registry.StandardAffixedHeader = BaseAnimatedHeader.extend({
        selector: 'header.o_header_standard:not(.o_header_sidebar)',
        init: function() {
            this._super(...arguments);
            this.fixedHeaderShow = false;
            this.scrolledPoint = 300;
        },
        start: function() {
            this.headerHeight = this.$el.outerHeight();
            return this._super.apply(this, arguments);
        },
        _isShown() {
            return !this.fixedHeader || this.fixedHeaderShow;
        },
        _updateHeaderOnScroll: function(scroll) {
            this._super(...arguments);
            const mainPosScrolled = (scroll > this.headerHeight + this.topGap);
            const reachPosScrolled = (scroll > this.scrolledPoint + this.topGap);
            const fixedUpdate = (this.fixedHeader !== mainPosScrolled);
            const showUpdate = (this.fixedHeaderShow !== reachPosScrolled);
            if (fixedUpdate || showUpdate) {
                this.$el.css('transform', reachPosScrolled ? `translate(0, -${this.topGap}px)` : mainPosScrolled ? 'translate(0, -100%)' : '');
                void this.$el[0].offsetWidth;
            }
            this.fixedHeaderShow = reachPosScrolled;
            if (fixedUpdate) {
                this._toggleFixedHeader(mainPosScrolled);
            } else if (showUpdate) {
                this._adaptToHeaderChange();
            }
        },
    });
    publicWidget.registry.FixedHeader = BaseAnimatedHeader.extend({
        selector: 'header.o_header_fixed:not(.o_header_sidebar)',
        _updateHeaderOnScroll: function(scroll) {
            this._super(...arguments);
            if (scroll > (this.scrolledPoint + this.topGap)) {
                if (!this.$el.hasClass('o_header_affixed')) {
                    this.$el.css('transform', `translate(0, -${this.topGap}px)`);
                    void this.$el[0].offsetWidth;
                    this._toggleFixedHeader(true);
                }
            } else {
                this._toggleFixedHeader(false);
                void this.$el[0].offsetWidth;
                this.$el.css('transform', '');
            }
        },
    });
    const BaseDisappearingHeader = publicWidget.registry.FixedHeader.extend({
        init: function() {
            this._super(...arguments);
            this.scrollingDownwards = true;
            this.hiddenHeader = false;
            this.position = 0;
            this.atTop = true;
            this.checkPoint = 0;
            this.scrollOffsetLimit = 200;
        },
        destroy: function() {
            this._showHeader();
            this._super.apply(this, arguments);
        },
        _hideHeader: function() {
            this.$el.trigger('odoo-transitionstart');
        },
        _isShown() {
            return !this.fixedHeader || !this.hiddenHeader;
        },
        _showHeader: function() {
            this.$el.trigger('odoo-transitionstart');
        },
        _updateHeaderOnScroll: function(scroll) {
            this._super(...arguments);
            const scrollingDownwards = (scroll > this.position);
            const atTop = (scroll <= 0);
            if (scrollingDownwards !== this.scrollingDownwards) {
                this.checkPoint = scroll;
            }
            this.scrollingDownwards = scrollingDownwards;
            this.position = scroll;
            this.atTop = atTop;
            if (scrollingDownwards) {
                if (!this.hiddenHeader && scroll - this.checkPoint > (this.scrollOffsetLimit + this.topGap)) {
                    this.hiddenHeader = true;
                    this._hideHeader();
                }
            } else {
                if (this.hiddenHeader && scroll - this.checkPoint < -(this.scrollOffsetLimit + this.topGap) / 2) {
                    this.hiddenHeader = false;
                    this._showHeader();
                }
            }
            if (atTop && !this.atTop) {
                this._showHeader();
            }
        },
    });
    publicWidget.registry.DisappearingHeader = BaseDisappearingHeader.extend({
        selector: 'header.o_header_disappears:not(.o_header_sidebar)',
        _hideHeader: function() {
            this._super(...arguments);
            this.$el.css('transform', 'translate(0, -100%)');
        },
        _showHeader: function() {
            this._super(...arguments);
            this.$el.css('transform', this.atTop ? '' : `translate(0, -${this.topGap}px)`);
        },
    });
    publicWidget.registry.FadeOutHeader = BaseDisappearingHeader.extend({
        selector: 'header.o_header_fade_out:not(.o_header_sidebar)',
        _hideHeader: function() {
            this._super(...arguments);
            this.$el.stop(false, true).fadeOut();
        },
        _showHeader: function() {
            this._super(...arguments);
            this.$el.css('transform', this.atTop ? '' : `translate(0, -${this.topGap}px)`);
            this.$el.stop(false, true).fadeIn();
        },
    });
    publicWidget.registry.autohideMenu = publicWidget.Widget.extend({
        selector: 'header#top',
        disabledInEditableMode: false,
        async start() {
            await this._super(...arguments);
            this.$topMenu = this.$('#top_menu');
            this.noAutohide = this.$el.is('.o_no_autohide_menu');
            if (!this.noAutohide) {
                await wUtils.onceAllImagesLoaded(this.$('.navbar'), this.$('.o_mega_menu, .o_offcanvas_logo_container, .dropdown-menu .o_lang_flag'));
                var $window = $(window);
                $window.on('load.autohideMenu', function() {
                    $window.trigger('resize');
                });
                dom.initAutoMoreMenu(this.$topMenu, {
                    unfoldable: '.divider, .divider ~ li, .o_no_autohide_item'
                });
            }
            this.$topMenu.removeClass('o_menu_loading');
            this.$topMenu.trigger('menu_loaded');
        },
        destroy() {
            this._super(...arguments);
            if (!this.noAutohide && this.$topMenu) {
                $(window).off('.autohideMenu');
                dom.destroyAutoMoreMenu(this.$topMenu);
            }
        },
    });
    publicWidget.registry.menuDirection = publicWidget.Widget.extend({
        selector: 'header .navbar .nav',
        disabledInEditableMode: false,
        events: {
            'show.bs.dropdown': '_onDropdownShow',
        },
        start: function() {
            this.defaultAlignment = this.$el.is('.ml-auto, .ml-auto ~ *') ? 'right' : 'left';
            return this._super.apply(this, arguments);
        },
        _checkOpening: function(alignment, liOffset, liWidth, menuWidth, pageWidth) {
            if (alignment === 'left') {
                return (liOffset + menuWidth <= pageWidth);
            } else {
                return (liOffset + liWidth - menuWidth >= 0);
            }
        },
        _onDropdownShow: function(ev) {
            var $li = $(ev.target);
            var $menu = $li.children('.dropdown-menu');
            var liOffset = $li.offset().left;
            var liWidth = $li.outerWidth();
            var menuWidth = $menu.outerWidth();
            var pageWidth = $('#wrapwrap').outerWidth();
            $menu.removeClass('dropdown-menu-left dropdown-menu-right');
            var alignment = this.defaultAlignment;
            if ($li.nextAll(':visible').length === 0) {
                alignment = 'right';
            }
            for (var i = 0; i < 2; i++) {
                if (!this._checkOpening(alignment, liOffset, liWidth, menuWidth, pageWidth)) {
                    alignment = (alignment === 'left' ? 'right' : 'left');
                }
            }
            $menu.addClass('dropdown-menu-' + alignment);
        },
    });
    publicWidget.registry.hoverableDropdown = animations.Animation.extend({
        selector: 'header.o_hoverable_dropdown',
        disabledInEditableMode: false,
        effects: [{
            startEvents: 'resize',
            update: '_dropdownHover',
        }],
        events: {
            'mouseenter .dropdown': '_onMouseEnter',
            'mouseleave .dropdown': '_onMouseLeave',
        },
        start: function() {
            this.$dropdownMenus = this.$el.find('.dropdown-menu');
            this.$dropdownToggles = this.$el.find('.dropdown-toggle');
            this._dropdownHover();
            return this._super.apply(this, arguments);
        },
        _dropdownHover: function() {
            if (config.device.size_class > config.device.SIZES.SM) {
                this.$dropdownMenus.css('margin-top', '0');
                this.$dropdownMenus.css('top', 'unset');
            } else {
                this.$dropdownMenus.css('margin-top', '');
                this.$dropdownMenus.css('top', '');
            }
        },
        _onMouseEnter: function(ev) {
            if (config.device.size_class <= config.device.SIZES.SM) {
                return;
            }
            const $dropdown = $(ev.currentTarget);
            $dropdown.addClass('show');
            $dropdown.find(this.$dropdownToggles).attr('aria-expanded', 'true');
            $dropdown.find(this.$dropdownMenus).addClass('show');
        },
        _onMouseLeave: function(ev) {
            if (config.device.size_class <= config.device.SIZES.SM) {
                return;
            }
            const $dropdown = $(ev.currentTarget);
            $dropdown.removeClass('show');
            $dropdown.find(this.$dropdownToggles).attr('aria-expanded', 'false');
            $dropdown.find(this.$dropdownMenus).removeClass('show');
        },
    });
    publicWidget.registry.HeaderMainCollapse = publicWidget.Widget.extend({
        selector: 'header#top',
        events: {
            'show.bs.collapse #top_menu_collapse': '_onCollapseShow',
            'hidden.bs.collapse #top_menu_collapse': '_onCollapseHidden',
        },
        _onCollapseShow() {
            this.el.classList.add('o_top_menu_collapse_shown');
        },
        _onCollapseHidden() {
            this.el.classList.remove('o_top_menu_collapse_shown');
        },
    });
    return {
        extraMenuUpdateCallbacks: extraMenuUpdateCallbacks,
    };
});
;
/* /website/static/src/js/content/snippets.animation.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.content.snippets.animation', function(require) {
    'use strict';
    var Class = require('web.Class');
    var config = require('web.config');
    var core = require('web.core');
    const dom = require('web.dom');
    var mixins = require('web.mixins');
    var publicWidget = require('web.public.widget');
    var utils = require('web.utils');
    var qweb = core.qweb;
    window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame || window.oRequestAnimationFrame;
    window.cancelAnimationFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame || window.msCancelAnimationFrame || window.oCancelAnimationFrame;
    if (!window.performance || !window.performance.now) {
        window.performance = {
            now: function() {
                return Date.now();
            }
        };
    }
    publicWidget.Widget.include({
        disabledInEditableMode: true,
        edit_events: null,
        read_events: null,
        init: function(parent, options) {
            this._super.apply(this, arguments);
            this.editableMode = this.options.editableMode || false;
            var extraEvents = this.editableMode ? this.edit_events : this.read_events;
            if (extraEvents) {
                this.events = _.extend({}, this.events || {}, extraEvents);
            }
        },
    });
    var AnimationEffect = Class.extend(mixins.ParentedMixin, {
        init: function(parent, updateCallback, startEvents, $startTarget, options) {
            mixins.ParentedMixin.init.call(this);
            this.setParent(parent);
            options = options || {};
            this._minFrameTime = 1000 / (options.maxFPS || 100);
            this._updateCallback = updateCallback;
            this.startEvents = startEvents || 'scroll';
            const mainScrollingElement = $().getScrollingElement()[0];
            const mainScrollingTarget = mainScrollingElement === document.documentElement ? window : mainScrollingElement;
            this.$startTarget = $($startTarget ? $startTarget : this.startEvents === 'scroll' ? mainScrollingTarget : window);
            if (options.getStateCallback) {
                this._getStateCallback = options.getStateCallback;
            } else if (this.startEvents === 'scroll' && this.$startTarget[0] === mainScrollingTarget) {
                const $scrollable = this.$startTarget;
                this._getStateCallback = function() {
                    return $scrollable.scrollTop();
                }
                ;
            } else if (this.startEvents === 'resize' && this.$startTarget[0] === window) {
                this._getStateCallback = function() {
                    return {
                        width: window.innerWidth,
                        height: window.innerHeight,
                    };
                }
                ;
            } else {
                this._getStateCallback = function() {
                    return undefined;
                }
                ;
            }
            this.endEvents = options.endEvents || false;
            this.$endTarget = options.$endTarget ? $(options.$endTarget) : this.$startTarget;
            this._updateCallback = this._updateCallback.bind(parent);
            this._getStateCallback = this._getStateCallback.bind(parent);
            this._uid = '_animationEffect' + _.uniqueId();
            this.startEvents = _processEvents(this.startEvents, this._uid);
            if (this.endEvents) {
                this.endEvents = _processEvents(this.endEvents, this._uid);
            }
            function _processEvents(events, namespace) {
                events = events.split(' ');
                return _.each(events, function(e, index) {
                    events[index] += ('.' + namespace);
                }).join(' ');
            }
        },
        destroy: function() {
            mixins.ParentedMixin.destroy.call(this);
            this.stop();
        },
        start: function() {
            this._paused = false;
            this._rafID = window.requestAnimationFrame((function(t) {
                this._update(t);
                this._paused = true;
            }
            ).bind(this));
            if (this.endEvents) {
                this.$startTarget.on(this.startEvents, (function(e) {
                    if (this._paused) {
                        _.defer(this.play.bind(this, e));
                    }
                }
                ).bind(this));
                this.$endTarget.on(this.endEvents, (function() {
                    if (!this._paused) {
                        _.defer(this.pause.bind(this));
                    }
                }
                ).bind(this));
            } else {
                var pauseTimer = null;
                this.$startTarget.on(this.startEvents, _.throttle((function(e) {
                    this.play(e);
                    clearTimeout(pauseTimer);
                    pauseTimer = _.delay((function() {
                        this.pause();
                        pauseTimer = null;
                    }
                    ).bind(this), 2000);
                }
                ).bind(this), 250, {
                    trailing: false
                }));
            }
        },
        stop: function() {
            this.$startTarget.off(this.startEvents);
            if (this.endEvents) {
                this.$endTarget.off(this.endEvents);
            }
            this.pause();
        },
        play: function(e) {
            this._newEvent = e;
            if (!this._paused) {
                return;
            }
            this._paused = false;
            this._rafID = window.requestAnimationFrame(this._update.bind(this));
            this._lastUpdateTimestamp = undefined;
        },
        pause: function() {
            if (this._paused) {
                return;
            }
            this._paused = true;
            window.cancelAnimationFrame(this._rafID);
            this._lastUpdateTimestamp = undefined;
        },
        _update: function(timestamp) {
            if (this._paused) {
                return;
            }
            this._rafID = window.requestAnimationFrame(this._update.bind(this));
            var elapsedTime = 0;
            if (this._lastUpdateTimestamp) {
                elapsedTime = timestamp - this._lastUpdateTimestamp;
                if (elapsedTime < this._minFrameTime) {
                    return;
                }
            }
            var animationState = this._getStateCallback(elapsedTime, this._newEvent);
            if (!this._newEvent && animationState !== undefined && _.isEqual(animationState, this._animationLastState)) {
                return;
            }
            this._animationLastState = animationState;
            this._updateCallback(this._animationLastState, elapsedTime, this._newEvent);
            this._lastUpdateTimestamp = timestamp;
            this._newEvent = undefined;
        },
    });
    var Animation = publicWidget.Widget.extend({
        maxFPS: 100,
        effects: [],
        start: function() {
            this._prepareEffects();
            _.each(this._animationEffects, function(effect) {
                effect.start();
            });
            return this._super.apply(this, arguments);
        },
        _prepareEffects: function() {
            this._animationEffects = [];
            var self = this;
            _.each(this.effects, function(desc) {
                self._addEffect(self[desc.update], desc.startEvents, _findTarget(desc.startTarget), {
                    getStateCallback: desc.getState && self[desc.getState],
                    endEvents: desc.endEvents || undefined,
                    $endTarget: _findTarget(desc.endTarget),
                    maxFPS: self.maxFPS,
                });
                function _findTarget(selector) {
                    if (selector) {
                        if (selector === 'selector') {
                            return self.$target;
                        }
                        return self.$(selector);
                    }
                    return undefined;
                }
            });
        },
        _addEffect: function(updateCallback, startEvents, $startTarget, options) {
            this._animationEffects.push(new AnimationEffect(this,updateCallback,startEvents,$startTarget,options));
        },
    });
    var registry = publicWidget.registry;
    registry.slider = publicWidget.Widget.extend({
        selector: '.carousel',
        disabledInEditableMode: false,
        edit_events: {
            'content_changed': '_onContentChanged',
        },
        start: function() {
            this.$('img').on('load.slider', () => this._computeHeights());
            this._computeHeights();
            this.$target.carousel(this.editableMode ? 'pause' : undefined);
            $(window).on('resize.slider', _.debounce( () => this._computeHeights(), 250));
            return this._super.apply(this, arguments);
        },
        destroy: function() {
            this._super.apply(this, arguments);
            this.$('img').off('.slider');
            this.$target.carousel('pause');
            this.$target.removeData('bs.carousel');
            _.each(this.$('.carousel-item'), function(el) {
                $(el).css('min-height', '');
            });
            $(window).off('.slider');
        },
        _computeHeights: function() {
            var maxHeight = 0;
            var $items = this.$('.carousel-item');
            $items.css('min-height', '');
            _.each($items, function(el) {
                var $item = $(el);
                var isActive = $item.hasClass('active');
                $item.addClass('active');
                var height = $item.outerHeight();
                if (height > maxHeight) {
                    maxHeight = height;
                }
                $item.toggleClass('active', isActive);
            });
            $items.css('min-height', maxHeight);
        },
        _onContentChanged: function(ev) {
            this._computeHeights();
        },
    });
    registry.Parallax = Animation.extend({
        selector: '.parallax',
        disabledInEditableMode: false,
        effects: [{
            startEvents: 'scroll',
            update: '_onWindowScroll',
        }],
        start: function() {
            this._rebuild();
            $(window).on('resize.animation_parallax', _.debounce(this._rebuild.bind(this), 500));
            return this._super.apply(this, arguments);
        },
        destroy: function() {
            this._super.apply(this, arguments);
            $(window).off('.animation_parallax');
        },
        _rebuild: function() {
            this.$bg = this.$('> .s_parallax_bg');
            this.speed = parseFloat(this.$target.attr('data-scroll-background-ratio') || 0);
            var noParallaxSpeed = (this.speed === 0 || this.speed === 1);
            if (noParallaxSpeed) {
                this.$bg.css({
                    transform: '',
                    top: '',
                    bottom: '',
                });
                return;
            }
            this.viewport = document.body.clientHeight - $('#wrapwrap').position().top;
            this.visibleArea = [this.$target.offset().top];
            this.visibleArea.push(this.visibleArea[0] + this.$target.innerHeight() + this.viewport);
            this.ratio = this.speed * (this.viewport / 10);
            const absoluteRatio = Math.abs(this.ratio);
            this.$bg.css({
                top: -absoluteRatio,
                bottom: -absoluteRatio,
            });
        },
        _onWindowScroll: function(scrollOffset) {
            if (this.speed === 0 || this.speed === 1) {
                return;
            }
            var vpEndOffset = scrollOffset + this.viewport;
            if (vpEndOffset >= this.visibleArea[0] && vpEndOffset <= this.visibleArea[1]) {
                this.$bg.css('transform', 'translateY(' + _getNormalizedPosition.call(this, vpEndOffset) + 'px)');
            }
            function _getNormalizedPosition(pos) {
                var r = (pos - this.visibleArea[1]) / (this.visibleArea[0] - this.visibleArea[1]);
                return Math.round(this.ratio * (2 * r - 1));
            }
        },
    });
    registry.mediaVideo = publicWidget.Widget.extend({
        selector: '.media_iframe_video',
        start: function() {
            var def = this._super.apply(this, arguments);
            if (this.$target.children('iframe').length) {
                return def;
            }
            this.$target.empty();
            this.$target.append('<div class="css_editable_mode_display">&nbsp;</div>' + '<div class="media_iframe_video_size">&nbsp;</div>');
            var src = _.escape(this.$target.data('oe-expression') || this.$target.data('src'));
            var m = src.match(/^(?:https?:)?\/\/([^/?#]+)/);
            if (!m) {
                return def;
            }
            var domain = m[1].replace(/^www\./, '');
            var supportedDomains = ['youtu.be', 'youtube.com', 'youtube-nocookie.com', 'instagram.com', 'vine.co', 'player.vimeo.com', 'vimeo.com', 'dailymotion.com', 'player.youku.com', 'youku.com'];
            if (!_.contains(supportedDomains, domain)) {
                return def;
            }
            this.$target.append($('<iframe/>', {
                src: src,
                frameborder: '0',
                allowfullscreen: 'allowfullscreen',
            }));
            return def;
        },
    });
    registry.backgroundVideo = publicWidget.Widget.extend({
        selector: '.o_background_video',
        xmlDependencies: ['/website/static/src/xml/website.background.video.xml'],
        disabledInEditableMode: false,
        start: function() {
            var proms = [this._super(...arguments)];
            this.videoSrc = this.el.dataset.bgVideoSrc;
            this.iframeID = _.uniqueId('o_bg_video_iframe_');
            this.isYoutubeVideo = this.videoSrc.indexOf('youtube') >= 0;
            this.isMobileEnv = config.device.size_class <= config.device.SIZES.LG && config.device.touch;
            if (this.isYoutubeVideo && this.isMobileEnv) {
                this.videoSrc = this.videoSrc + "&enablejsapi=1";
                if (!window.YT) {
                    var oldOnYoutubeIframeAPIReady = window.onYouTubeIframeAPIReady;
                    proms.push(new Promise(resolve => {
                        window.onYouTubeIframeAPIReady = () => {
                            if (oldOnYoutubeIframeAPIReady) {
                                oldOnYoutubeIframeAPIReady();
                            }
                            return resolve();
                        }
                        ;
                    }
                    ));
                    $('<script/>', {
                        src: 'https://www.youtube.com/iframe_api',
                    }).appendTo('head');
                }
            }
            var throttledUpdate = _.throttle( () => this._adjustIframe(), 50);
            var $dropdownMenu = this.$el.closest('.dropdown-menu');
            if ($dropdownMenu.length) {
                this.$dropdownParent = $dropdownMenu.parent();
                this.$dropdownParent.on('shown.bs.dropdown.backgroundVideo', throttledUpdate);
            }
            $(window).on('resize.' + this.iframeID, throttledUpdate);
            const $modal = this.$target.closest('.modal');
            if ($modal.length) {
                $modal.on('show.bs.modal', () => {
                    const videoContainerEl = this.$target[0].querySelector('.o_bg_video_container');
                    videoContainerEl.classList.add('d-none');
                }
                );
                $modal.on('shown.bs.modal', () => {
                    this._adjustIframe();
                    const videoContainerEl = this.$target[0].querySelector('.o_bg_video_container');
                    videoContainerEl.classList.remove('d-none');
                }
                );
            }
            return Promise.all(proms).then( () => this._appendBgVideo());
        },
        destroy: function() {
            this._super.apply(this, arguments);
            if (this.$dropdownParent) {
                this.$dropdownParent.off('.backgroundVideo');
            }
            $(window).off('resize.' + this.iframeID);
            if (this.$bgVideoContainer) {
                this.$bgVideoContainer.remove();
            }
        },
        _adjustIframe: function() {
            if (!this.$iframe) {
                return;
            }
            this.$iframe.removeClass('show');
            var wrapperWidth = this.$target.innerWidth();
            var wrapperHeight = this.$target.innerHeight();
            var relativeRatio = (wrapperWidth / wrapperHeight) / (16 / 9);
            var style = {};
            if (relativeRatio >= 1.0) {
                style['width'] = '100%';
                style['height'] = (relativeRatio * 100) + '%';
                style['left'] = '0';
                style['top'] = (-(relativeRatio - 1.0) / 2 * 100) + '%';
            } else {
                style['width'] = ((1 / relativeRatio) * 100) + '%';
                style['height'] = '100%';
                style['left'] = (-((1 / relativeRatio) - 1.0) / 2 * 100) + '%';
                style['top'] = '0';
            }
            this.$iframe.css(style);
            void this.$iframe[0].offsetWidth;
            this.$iframe.addClass('show');
        },
        _appendBgVideo: function() {
            var $oldContainer = this.$bgVideoContainer || this.$('> .o_bg_video_container');
            this.$bgVideoContainer = $(qweb.render('website.background.video', {
                videoSrc: this.videoSrc,
                iframeID: this.iframeID,
            }));
            this.$iframe = this.$bgVideoContainer.find('.o_bg_video_iframe');
            this.$iframe.one('load', () => {
                this.$bgVideoContainer.find('.o_bg_video_loading').remove();
            }
            );
            this.$bgVideoContainer.prependTo(this.$target);
            $oldContainer.remove();
            this._adjustIframe();
            if (this.isMobileEnv && this.isYoutubeVideo) {
                new window.YT.Player(this.iframeID,{
                    events: {
                        onReady: ev => ev.target.playVideo(),
                    }
                });
            }
        },
    });
    registry.socialShare = publicWidget.Widget.extend({
        selector: '.oe_social_share',
        xmlDependencies: ['/website/static/src/xml/website.share.xml'],
        events: {
            'mouseenter': '_onMouseEnter',
        },
        _bindSocialEvent: function() {
            this.$('.oe_social_facebook').click($.proxy(this._renderSocial, this, 'facebook'));
            this.$('.oe_social_twitter').click($.proxy(this._renderSocial, this, 'twitter'));
            this.$('.oe_social_linkedin').click($.proxy(this._renderSocial, this, 'linkedin'));
        },
        _render: function() {
            this.$el.popover({
                content: qweb.render('website.social_hover', {
                    medias: this.socialList
                }),
                placement: 'bottom',
                container: this.$el,
                html: true,
                trigger: 'manual',
                animation: false,
            }).popover("show");
            this.$el.off('mouseleave.socialShare').on('mouseleave.socialShare', function() {
                var self = this;
                setTimeout(function() {
                    if (!$(".popover:hover").length) {
                        $(self).popover('dispose');
                    }
                }, 200);
            });
        },
        _renderSocial: function(social) {
            var url = this.$el.data('urlshare') || document.URL.split(/[?#]/)[0];
            url = encodeURIComponent(url);
            var title = document.title.split(" | ")[0];
            var hashtags = ' #' + document.title.split(" | ")[1].replace(' ', '') + ' ' + this.hashtags;
            var socialNetworks = {
                'facebook': 'https://www.facebook.com/sharer/sharer.php?u=' + url,
                'twitter': 'https://twitter.com/intent/tweet?original_referer=' + url + '&text=' + encodeURIComponent(title + hashtags + ' - ') + url,
                'linkedin': 'https://www.linkedin.com/sharing/share-offsite/?url=' + url,
            };
            if (!_.contains(_.keys(socialNetworks), social)) {
                return;
            }
            var wHeight = 500;
            var wWidth = 500;
            window.open(socialNetworks[social], '', 'menubar=no, toolbar=no, resizable=yes, scrollbar=yes, height=' + wHeight + ',width=' + wWidth);
        },
        _onMouseEnter: function() {
            var social = this.$el.data('social');
            this.socialList = social ? social.split(',') : ['facebook', 'twitter', 'linkedin'];
            this.hashtags = this.$el.data('hashtags') || '';
            this._render();
            this._bindSocialEvent();
        },
    });
    registry.anchorSlide = publicWidget.Widget.extend({
        selector: 'a[href^="/"][href*="#"], a[href^="#"]',
        events: {
            'click': '_onAnimateClick',
        },
        async _scrollTo($el, scrollValue='true') {
            return dom.scrollTo($el[0], {
                duration: scrollValue === 'true' ? 500 : 0,
                extraOffset: this._computeExtraOffset(),
            });
        },
        _computeExtraOffset() {
            return 0;
        },
        _onAnimateClick: function(ev) {
            if (this.$target[0].pathname !== window.location.pathname) {
                return;
            }
            var hash = this.$target[0].hash;
            if (!utils.isValidAnchor(hash)) {
                return;
            }
            var $anchor = $(hash);
            const scrollValue = $anchor.attr('data-anchor');
            if (!$anchor.length || !scrollValue) {
                return;
            }
            ev.preventDefault();
            this._scrollTo($anchor, scrollValue);
        },
    });
    registry.FullScreenHeight = publicWidget.Widget.extend({
        selector: '.o_full_screen_height',
        disabledInEditableMode: false,
        start() {
            this.inModal = !!this.el.closest('.modal');
            if (this.$el.is(':not(:visible)') || this.$el.outerHeight() > this._computeIdealHeight()) {
                this._adaptSize();
                $(window).on('resize.FullScreenHeight', _.debounce( () => this._adaptSize(), 250));
            }
            return this._super(...arguments);
        },
        destroy() {
            this._super(...arguments);
            $(window).off('.FullScreenHeight');
            this.el.style.setProperty('min-height', '');
        },
        _adaptSize() {
            const height = this._computeIdealHeight();
            this.el.style.setProperty('min-height', `${height}px`, 'important');
        },
        _computeIdealHeight() {
            const windowHeight = $(window).outerHeight();
            if (this.inModal) {
                return (windowHeight - $('#wrapwrap').position().top);
            }
            const firstContentEl = $('#wrapwrap > main > :first-child')[0];
            const mainTopPos = firstContentEl.getBoundingClientRect().top + dom.closestScrollable(firstContentEl.parentNode).scrollTop;
            return (windowHeight - mainTopPos);
        },
    });
    registry.ScrollButton = registry.anchorSlide.extend({
        selector: '.o_scroll_button',
        _onAnimateClick: function(ev) {
            ev.preventDefault();
            const $nextElement = this.$el.closest('section').next();
            if ($nextElement.length) {
                this._scrollTo($nextElement);
            }
        },
    });
    registry.FooterSlideout = publicWidget.Widget.extend({
        selector: '#wrapwrap:has(.o_footer_slideout)',
        disabledInEditableMode: false,
        async start() {
            const $main = this.$('> main');
            const slideoutEffect = $main.outerHeight() >= $(window).outerHeight();
            this.el.classList.toggle('o_footer_effect_enable', slideoutEffect);
            this.__pixelEl = document.createElement('div');
            this.__pixelEl.style.width = `1px`;
            this.__pixelEl.style.height = `1px`;
            this.__pixelEl.style.marginTop = `-1px`;
            this.el.appendChild(this.__pixelEl);
            return this._super(...arguments);
        },
        destroy() {
            this._super(...arguments);
            this.el.classList.remove('o_footer_effect_enable');
            this.__pixelEl.remove();
        },
    });
    registry.HeaderHamburgerFull = publicWidget.Widget.extend({
        selector: 'header:has(.o_header_hamburger_full_toggler):not(:has(.o_offcanvas_menu_toggler))',
        events: {
            'click .o_header_hamburger_full_toggler': '_onToggleClick',
        },
        _onToggleClick() {
            document.body.classList.add('overflow-hidden');
            setTimeout( () => $(window).trigger('scroll'), 100);
        },
    });
    registry.BottomFixedElement = publicWidget.Widget.extend({
        selector: '#wrapwrap',
        async start() {
            this.$scrollingElement = $().getScrollingElement();
            this.__hideBottomFixedElements = _.debounce( () => this._hideBottomFixedElements(), 500);
            this.$scrollingElement.on('scroll.bottom_fixed_element', this.__hideBottomFixedElements);
            $(window).on('resize.bottom_fixed_element', this.__hideBottomFixedElements);
            return this._super(...arguments);
        },
        destroy() {
            this._super(...arguments);
            this.$scrollingElement.off('.bottom_fixed_element');
            $(window).off('.bottom_fixed_element');
            $('.o_bottom_fixed_element').removeClass('o_bottom_fixed_element_hidden');
        },
        _hideBottomFixedElements() {
            const $bottomFixedElements = $('.o_bottom_fixed_element');
            if (!$bottomFixedElements.length) {
                return;
            }
            $bottomFixedElements.removeClass('o_bottom_fixed_element_hidden');
            if ((this.$scrollingElement[0].offsetHeight + this.$scrollingElement[0].scrollTop) >= (this.$scrollingElement[0].scrollHeight - 2)) {
                const buttonEls = [...this.$('.btn:visible')];
                for (const el of $bottomFixedElements) {
                    if (buttonEls.some(button => dom.areColliding(button, el))) {
                        el.classList.add('o_bottom_fixed_element_hidden');
                    }
                }
            }
        },
    });
    return {
        Widget: publicWidget.Widget,
        Animation: Animation,
        registry: registry,
        Class: Animation,
    };
});
;
/* /website/static/src/js/menu/navbar.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.navbar', function(require) {
    'use strict';
    var core = require('web.core');
    var dom = require('web.dom');
    var publicWidget = require('web.public.widget');
    var concurrency = require('web.concurrency');
    var Widget = require('web.Widget');
    var websiteRootData = require('website.root');
    var websiteNavbarRegistry = new publicWidget.RootWidgetRegistry();
    var WebsiteNavbar = publicWidget.RootWidget.extend({
        xmlDependencies: ['/website/static/src/xml/website.xml'],
        events: _.extend({}, publicWidget.RootWidget.prototype.events || {}, {
            'click [data-action]': '_onActionMenuClick',
            'mouseover > ul > li.dropdown:not(.show)': '_onMenuHovered',
            'click .o_mobile_menu_toggle': '_onMobileMenuToggleClick',
            'mouseenter #oe_applications:not(:has(.dropdown-item))': '_onOeApplicationsHovered',
            'show.bs.dropdown #oe_applications:not(:has(.dropdown-item))': '_onOeApplicationsShow',
        }),
        custom_events: _.extend({}, publicWidget.RootWidget.prototype.custom_events || {}, {
            'action_demand': '_onActionDemand',
            'edit_mode': '_onEditMode',
            'readonly_mode': '_onReadonlyMode',
            'ready_to_save': '_onSave',
        }),
        init: function() {
            this._super.apply(this, arguments);
            var self = this;
            var initPromise = new Promise(function(resolve) {
                self.resolveInit = resolve;
            }
            );
            this._widgetDefs = [initPromise];
        },
        start: function() {
            var self = this;
            dom.initAutoMoreMenu(this.$('ul.o_menu_sections'), {
                maxWidth: function() {
                    return self.$el.width() - (self.$('.o_menu_systray').outerWidth(true) || 0) - (self.$('ul#oe_applications').outerWidth(true) || 0) - (self.$('.o_menu_toggle').outerWidth(true) || 0) - (self.$('.o_menu_brand').outerWidth(true) || 0);
                },
            });
            return this._super.apply(this, arguments).then(function() {
                self.resolveInit();
            });
        },
        _attachComponent: function() {
            var def = this._super.apply(this, arguments);
            this._widgetDefs.push(def);
            return def;
        },
        _getRegistry: function() {
            return websiteNavbarRegistry;
        },
        _handleAction: function(actionName, params, _i) {
            var self = this;
            return this._whenReadyForActions().then(function() {
                var defs = [];
                _.each(self._widgets, function(w) {
                    if (!w.handleAction) {
                        return;
                    }
                    var def = w.handleAction(actionName, params);
                    if (def !== null) {
                        defs.push(def);
                    }
                });
                if (!defs.length) {
                    if (_i > 50) {
                        console.warn(_.str.sprintf("Action '%s' was not able to be handled.", actionName));
                        return Promise.reject();
                    }
                    return concurrency.delay(100).then(function() {
                        return self._handleAction(actionName, params, (_i || 0) + 1);
                    });
                }
                return Promise.all(defs).then(function(values) {
                    if (values.length === 1) {
                        return values[0];
                    }
                    return values;
                });
            });
        },
        async _loadAppMenus() {
            if (!this._loadAppMenusProm) {
                this._loadAppMenusProm = this._rpc({
                    model: 'ir.ui.menu',
                    method: 'load_menus_root',
                    args: [],
                });
                const result = await this._loadAppMenusProm;
                const menus = core.qweb.render('website.oe_applications_menu', {
                    'menu_data': result,
                });
                this.$('#oe_applications .dropdown-menu').html(menus);
            }
            return this._loadAppMenusProm;
        },
        _whenReadyForActions: function() {
            return Promise.all(this._widgetDefs);
        },
        _onOeApplicationsHovered: function() {
            this._loadAppMenus();
        },
        _onOeApplicationsShow: function() {
            this._loadAppMenus();
        },
        _onActionMenuClick: function(ev) {
            const restore = dom.addButtonLoadingEffect(ev.currentTarget);
            this._handleAction($(ev.currentTarget).data('action')).then(restore).guardedCatch(restore);
        },
        _onActionDemand: function(ev) {
            var def = this._handleAction(ev.data.actionName, ev.data.params);
            if (ev.data.onSuccess) {
                def.then(ev.data.onSuccess);
            }
            if (ev.data.onFailure) {
                def.guardedCatch(ev.data.onFailure);
            }
        },
        _onEditMode: function() {
            this.$el.addClass('editing_mode');
            this.do_hide();
        },
        _onMenuHovered: function(ev) {
            var $opened = this.$('> ul > li.dropdown.show');
            if ($opened.length) {
                $opened.find('.dropdown-toggle').dropdown('toggle');
                $(ev.currentTarget).find('.dropdown-toggle').dropdown('toggle');
            }
        },
        _onMobileMenuToggleClick: function() {
            this.$el.parent().toggleClass('o_mobile_menu_opened');
        },
        _onReadonlyMode: function() {
            this.$el.removeClass('editing_mode');
            this.do_show();
        },
        _onSave: function(ev) {
            ev.data.defs.push(this._handleAction('on_save'));
        },
    });
    var WebsiteNavbarActionWidget = Widget.extend({
        actions: {},
        handleAction: function(actionName, params) {
            var action = this[this.actions[actionName]];
            if (action) {
                return Promise.resolve(action.apply(this, params || []));
            }
            return null;
        },
    });
    websiteRootData.websiteRootRegistry.add(WebsiteNavbar, '#oe_main_menu_navbar');
    return {
        WebsiteNavbar: WebsiteNavbar,
        websiteNavbarRegistry: websiteNavbarRegistry,
        WebsiteNavbarActionWidget: WebsiteNavbarActionWidget,
    };
});
;
/* /website/static/src/js/show_password.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.show_password', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    publicWidget.registry.ShowPassword = publicWidget.Widget.extend({
        selector: '#showPass',
        events: {
            'mousedown': '_onShowText',
            'touchstart': '_onShowText',
        },
        destroy: function() {
            this._super(...arguments);
            $('body').off(".ShowPassword");
        },
        _onShowPassword: function() {
            this.$el.closest('.input-group').find('#password').attr('type', 'password');
        },
        _onShowText: function() {
            $('body').one('mouseup.ShowPassword touchend.ShowPassword', this._onShowPassword.bind(this));
            this.$el.closest('.input-group').find('#password').attr('type', 'text');
        },
    });
    return publicWidget.registry.ShowPassword;
});
;
/* /website/static/src/js/post_link.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.post_link', function(require) {
    'use strict';
    const publicWidget = require('web.public.widget');
    const wUtils = require('website.utils');
    publicWidget.registry.postLink = publicWidget.Widget.extend({
        selector: '.post_link',
        events: {
            'click': '_onClickPost',
        },
        _onClickPost: function(ev) {
            ev.preventDefault();
            const url = this.el.dataset.post || this.el.href;
            let data = {};
            for (let[key,value] of Object.entries(this.el.dataset)) {
                if (key.startsWith('post_')) {
                    data[key.slice(5)] = value;
                }
            }
            ;wUtils.sendRequest(url, data);
        },
    });
});
;
/* /website/static/src/js/user_custom_javascript.js defined in bundle 'web.assets_frontend_lazy' */
;
/* /website/static/src/snippets/s_share/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_share', function(require) {
    'use strict';
    const publicWidget = require('web.public.widget');
    const ShareWidget = publicWidget.Widget.extend({
        selector: '.s_share, .oe_share',
        start: function() {
            const urlRegex = /(\?(?:|.*&)(?:u|url|body)=)(.*?)(&|#|$)/;
            const titleRegex = /(\?(?:|.*&)(?:title|text|subject|description)=)(.*?)(&|#|$)/;
            const mediaRegex = /(\?(?:|.*&)(?:media)=)(.*?)(&|#|$)/;
            const url = encodeURIComponent(window.location.href);
            const title = encodeURIComponent($('title').text());
            const media = encodeURIComponent($('meta[property="og:image"]').attr('content'));
            this.$('a').each( (index, element) => {
                const $a = $(element);
                $a.attr('href', (i, href) => {
                    return href.replace(urlRegex, (match, a, b, c) => {
                        return a + url + c;
                    }
                    ).replace(titleRegex, function(match, a, b, c) {
                        if ($a.hasClass('s_share_whatsapp')) {
                            return a + title + url + c;
                        }
                        return a + title + c;
                    }).replace(mediaRegex, (match, a, b, c) => {
                        return a + media + c;
                    }
                    );
                }
                );
                if ($a.attr('target') && $a.attr('target').match(/_blank/i) && !$a.closest('.o_editable').length) {
                    $a.on('click', function() {
                        window.open(this.href, '', 'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,height=550,width=600');
                        return false;
                    });
                }
            }
            );
            return this._super.apply(this, arguments);
        },
    });
    publicWidget.registry.share = ShareWidget;
    return ShareWidget;
});
;
/* /website/static/src/snippets/s_facebook_page/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_facebook_page', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    var utils = require('web.utils');
    const FacebookPageWidget = publicWidget.Widget.extend({
        selector: '.o_facebook_page',
        disabledInEditableMode: false,
        start: function() {
            var def = this._super.apply(this, arguments);
            var params = _.pick(this.$el.data(), 'href', 'height', 'tabs', 'small_header', 'hide_cover', 'show_facepile');
            if (!params.href) {
                return def;
            }
            params.width = utils.confine(Math.floor(this.$el.width()), 180, 500);
            var src = $.param.querystring('https://www.facebook.com/plugins/page.php', params);
            this.$iframe = $('<iframe/>', {
                src: src,
                class: 'o_temp_auto_element',
                width: params.width,
                height: params.height,
                css: {
                    border: 'none',
                    overflow: 'hidden',
                },
                scrolling: 'no',
                frameborder: '0',
                allowTransparency: 'true',
            });
            this.$el.append(this.$iframe);
            return def;
        },
        destroy: function() {
            this._super.apply(this, arguments);
            if (this.$iframe) {
                this.$iframe.remove();
            }
        },
    });
    publicWidget.registry.facebookPage = FacebookPageWidget;
    return FacebookPageWidget;
});
;
/* /website/static/src/snippets/s_image_gallery/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_image_gallery', function(require) {
    'use strict';
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var qweb = core.qweb;
    const GalleryWidget = publicWidget.Widget.extend({
        selector: '.s_image_gallery:not(.o_slideshow)',
        xmlDependencies: ['/website/static/src/snippets/s_image_gallery/000.xml'],
        events: {
            'click img': '_onClickImg',
        },
        _onClickImg: function(ev) {
            var self = this;
            var $cur = $(ev.currentTarget);
            var $images = $cur.closest('.s_image_gallery').find('img');
            var size = 0.8;
            var dimensions = {
                min_width: Math.round(window.innerWidth * size * 0.9),
                min_height: Math.round(window.innerHeight * size),
                max_width: Math.round(window.innerWidth * size * 0.9),
                max_height: Math.round(window.innerHeight * size),
                width: Math.round(window.innerWidth * size * 0.9),
                height: Math.round(window.innerHeight * size)
            };
            var $img = ($cur.is('img') === true) ? $cur : $cur.closest('img');
            const milliseconds = $cur.closest('.s_image_gallery').data('interval') || false;
            var $modal = $(qweb.render('website.gallery.slideshow.lightbox', {
                images: $images.get(),
                index: $images.index($img),
                dim: dimensions,
                interval: milliseconds || 0,
                id: _.uniqueId('slideshow_'),
            }));
            $modal.modal({
                keyboard: true,
                backdrop: true,
            });
            $modal.on('hidden.bs.modal', function() {
                $(this).hide();
                $(this).siblings().filter('.modal-backdrop').remove();
                $(this).remove();
            });
            $modal.find('.modal-content, .modal-body.o_slideshow').css('height', '100%');
            $modal.appendTo(document.body);
            $modal.one('shown.bs.modal', function() {
                self.trigger_up('widgets_start_request', {
                    editableMode: false,
                    $target: $modal.find('.modal-body.o_slideshow'),
                });
            });
        },
    });
    const GallerySliderWidget = publicWidget.Widget.extend({
        selector: '.o_slideshow',
        xmlDependencies: ['/website/static/src/snippets/s_image_gallery/000.xml'],
        disabledInEditableMode: false,
        start: function() {
            var self = this;
            this.$carousel = this.$target.is('.carousel') ? this.$target : this.$target.find('.carousel');
            this.$indicator = this.$carousel.find('.carousel-indicators');
            this.$prev = this.$indicator.find('li.o_indicators_left').css('visibility', '');
            this.$next = this.$indicator.find('li.o_indicators_right').css('visibility', '');
            var $lis = this.$indicator.find('li[data-slide-to]');
            let indicatorWidth = this.$indicator.width();
            if (indicatorWidth === 0) {
                const $indicatorParent = this.$indicator.parents().not(':visible').last();
                if (!$indicatorParent[0].style.display) {
                    $indicatorParent[0].style.display = 'block';
                    indicatorWidth = this.$indicator.width();
                    $indicatorParent[0].style.display = '';
                }
            }
            let nbPerPage = Math.floor(indicatorWidth / $lis.first().outerWidth(true)) - 3;
            var realNbPerPage = nbPerPage || 1;
            var nbPages = Math.ceil($lis.length / realNbPerPage);
            var index;
            var page;
            update();
            function hide() {
                $lis.each(function(i) {
                    $(this).toggleClass('d-none', i < page * nbPerPage || i >= (page + 1) * nbPerPage);
                });
                if (page <= 0) {
                    self.$prev.detach();
                } else {
                    self.$prev.removeClass('d-none');
                    self.$prev.prependTo(self.$indicator);
                }
                if (page >= nbPages - 1) {
                    self.$next.detach();
                } else {
                    self.$next.removeClass('d-none');
                    self.$next.appendTo(self.$indicator);
                }
            }
            function update() {
                const active = $lis.filter('.active');
                index = active.length ? $lis.index(active) : 0;
                page = Math.floor(index / realNbPerPage);
                hide();
            }
            this.$carousel.on('slide.bs.carousel.gallery_slider', function() {
                setTimeout(function() {
                    var $item = self.$carousel.find('.carousel-inner .carousel-item-prev, .carousel-inner .carousel-item-next');
                    var index = $item.index();
                    $lis.removeClass('active').filter('[data-slide-to="' + index + '"]').addClass('active');
                }, 0);
            });
            this.$indicator.on('click.gallery_slider', '> li:not([data-slide-to])', function() {
                page += ($(this).hasClass('o_indicators_left') ? -1 : 1);
                page = Math.max(0, Math.min(nbPages - 1, page));
                self.$carousel.carousel(page * realNbPerPage);
                if (!self.editableMode) {
                    hide();
                }
            });
            this.$carousel.on('slid.bs.carousel.gallery_slider', update);
            return this._super.apply(this, arguments);
        },
        destroy: function() {
            this._super.apply(this, arguments);
            if (!this.$indicator) {
                return;
            }
            this.$prev.prependTo(this.$indicator);
            this.$next.appendTo(this.$indicator);
            this.$carousel.off('.gallery_slider');
            this.$indicator.off('.gallery_slider');
        },
    });
    publicWidget.registry.gallery = GalleryWidget;
    publicWidget.registry.gallerySlider = GallerySliderWidget;
    return {
        GalleryWidget: GalleryWidget,
        GallerySliderWidget: GallerySliderWidget,
    };
});
;
/* /website/static/src/snippets/s_countdown/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_countdown', function(require) {
    'use strict';
    const {ColorpickerWidget} = require('web.Colorpicker');
    const core = require('web.core');
    const publicWidget = require('web.public.widget');
    const weUtils = require('web_editor.utils');
    const qweb = core.qweb;
    const _t = core._t;
    const CountdownWidget = publicWidget.Widget.extend({
        selector: '.s_countdown',
        xmlDependencies: ['/website/static/src/snippets/s_countdown/000.xml'],
        disabledInEditableMode: false,
        defaultColor: 'rgba(0, 0, 0, 255)',
        start: function() {
            this.$wrapper = this.$('.s_countdown_canvas_wrapper');
            this.hereBeforeTimerEnds = false;
            this.endAction = this.el.dataset.endAction;
            this.endTime = parseInt(this.el.dataset.endTime);
            this.size = parseInt(this.el.dataset.size);
            this.display = this.el.dataset.display;
            this.layout = this.el.dataset.layout;
            this.layoutBackground = this.el.dataset.layoutBackground;
            this.progressBarStyle = this.el.dataset.progressBarStyle;
            this.progressBarWeight = this.el.dataset.progressBarWeight;
            this.textColor = this._ensureCssColor(this.el.dataset.textColor);
            this.layoutBackgroundColor = this._ensureCssColor(this.el.dataset.layoutBackgroundColor);
            this.progressBarColor = this._ensureCssColor(this.el.dataset.progressBarColor);
            this.onlyOneUnit = this.display === 'd';
            this.width = parseInt(this.size);
            if (this.layout === 'boxes') {
                this.width /= 1.75;
            }
            this._initTimeDiff();
            this._render();
            this.setInterval = setInterval(this._render.bind(this), 1000);
            return this._super(...arguments);
        },
        destroy: function() {
            this.$('.s_countdown_end_redirect_message').remove();
            this.$('canvas').remove();
            this.$('.s_countdown_end_message').addClass('d-none');
            this.$('.s_countdown_text_wrapper').remove();
            this.$('.s_countdown_canvas_wrapper').removeClass('d-none');
            clearInterval(this.setInterval);
            this._super(...arguments);
        },
        _ensureCssColor: function(color) {
            if (ColorpickerWidget.isCSSColor(color)) {
                return color;
            }
            return weUtils.getCSSVariableValue(color) || this.defaultColor;
        },
        _getDelta: function() {
            const currentTimestamp = Date.now() / 1000;
            return this.endTime - currentTimestamp;
        },
        _handleEndCountdownAction: function() {
            if (this.endAction === 'redirect') {
                const redirectUrl = this.el.dataset.redirectUrl || '/';
                if (this.hereBeforeTimerEnds) {
                    setTimeout( () => window.location = redirectUrl, 500);
                } else {
                    if (!this.$('.s_countdown_end_redirect_message').length) {
                        const $container = this.$('> .container, > .container-fluid, > .o_container_small');
                        $container.append($(qweb.render('website.s_countdown.end_redirect_message', {
                            redirectUrl: redirectUrl,
                        })));
                    }
                }
            } else if (this.endAction === 'message') {
                this.$('.s_countdown_end_message').removeClass('d-none');
            }
        },
        _initTimeDiff: function() {
            const delta = this._getDelta();
            this.diff = [];
            if (this._isUnitVisible('d') && !(this.onlyOneUnit && delta < 86400)) {
                this.diff.push({
                    canvas: $('<canvas/>', {
                        class: 'o_temp_auto_element'
                    }).appendTo(this.$wrapper)[0],
                    total: 15,
                    label: _t("Days"),
                    nbSeconds: 86400,
                });
            }
            if (this._isUnitVisible('h') || (this.onlyOneUnit && delta < 86400 && delta > 3600)) {
                this.diff.push({
                    canvas: $('<canvas/>', {
                        class: 'o_temp_auto_element'
                    }).appendTo(this.$wrapper)[0],
                    total: 24,
                    label: _t("Hours"),
                    nbSeconds: 3600,
                });
            }
            if (this._isUnitVisible('m') || (this.onlyOneUnit && delta < 3600 && delta > 60)) {
                this.diff.push({
                    canvas: $('<canvas/>', {
                        class: 'o_temp_auto_element'
                    }).appendTo(this.$wrapper)[0],
                    total: 60,
                    label: _t("Minutes"),
                    nbSeconds: 60,
                });
            }
            if (this._isUnitVisible('s') || (this.onlyOneUnit && delta < 60)) {
                this.diff.push({
                    canvas: $('<canvas/>', {
                        class: 'o_temp_auto_element'
                    }).appendTo(this.$wrapper)[0],
                    total: 60,
                    label: _t("Seconds"),
                    nbSeconds: 1,
                });
            }
        },
        _isUnitVisible: function(unit) {
            return this.display.includes(unit);
        },
        _render: function() {
            if (this.onlyOneUnit && this._getDelta() < this.diff[0].nbSeconds) {
                this.$('canvas').remove();
                this._initTimeDiff();
            }
            this._updateTimeDiff();
            const hideCountdown = this.isFinished && !this.editableMode && this.$el.hasClass('hide-countdown');
            if (this.layout === 'text') {
                this.$('canvas').addClass('d-none');
                if (!this.$textWrapper) {
                    this.$textWrapper = $('<span/>').attr({
                        class: 's_countdown_text_wrapper d-none',
                    });
                    this.$textWrapper.text(_t("Countdown ends in"));
                    this.$textWrapper.append($('<span/>').attr({
                        class: 's_countdown_text ml-1',
                    }));
                    this.$textWrapper.appendTo(this.$wrapper);
                }
                this.$textWrapper.toggleClass('d-none', hideCountdown);
                const countdownText = this.diff.map(e => e.nb + ' ' + e.label).join(', ');
                this.$('.s_countdown_text').text(countdownText.toLowerCase());
            } else {
                for (const val of this.diff) {
                    const canvas = val.canvas;
                    const ctx = canvas.getContext("2d");
                    ctx.canvas.width = this.width;
                    ctx.canvas.height = this.size;
                    this._clearCanvas(ctx);
                    $(canvas).toggleClass('d-none', hideCountdown);
                    if (hideCountdown) {
                        continue;
                    }
                    if (this.layoutBackground !== 'none') {
                        this._drawBgShape(ctx, this.layoutBackground === 'plain');
                    }
                    this._drawText(canvas, val.nb, val.label, this.layoutBackground === 'plain');
                    if (this.progressBarStyle === 'surrounded') {
                        this._drawProgressBarBg(ctx, this.progressBarWeight === 'thin');
                    }
                    if (this.progressBarStyle !== 'none') {
                        this._drawProgressBar(ctx, val.nb, val.total, this.progressBarWeight === 'thin');
                    }
                    $(canvas).toggleClass('mx-2', this.layout === 'boxes');
                }
            }
            if (this.isFinished) {
                clearInterval(this.setInterval);
                if (!this.editableMode) {
                    this._handleEndCountdownAction();
                }
            }
        },
        _updateTimeDiff: function() {
            let delta = this._getDelta();
            this.isFinished = delta < 0;
            if (this.isFinished) {
                for (const unitData of this.diff) {
                    unitData.nb = 0;
                }
                return;
            }
            this.hereBeforeTimerEnds = true;
            for (const unitData of this.diff) {
                unitData.nb = Math.floor(delta / unitData.nbSeconds);
                delta -= unitData.nb * unitData.nbSeconds;
            }
        },
        _clearCanvas: function(ctx) {
            ctx.clearRect(0, 0, this.size, this.size);
        },
        _drawText: function(canvas, textNb, textUnit, full=false) {
            const ctx = canvas.getContext("2d");
            const nbSize = this.size / 4;
            ctx.font = `${nbSize}px Arial`;
            ctx.fillStyle = this.textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(textNb, canvas.width / 2, canvas.height / 2);
            const unitSize = this.size / 12;
            ctx.font = `${unitSize}px Arial`;
            ctx.fillText(textUnit, canvas.width / 2, canvas.height / 2 + nbSize / 1.5, this.width);
            if (this.layout === 'boxes' && this.layoutBackground !== 'none' && this.progressBarStyle === 'none') {
                let barWidth = this.size / (this.progressBarWeight === 'thin' ? 31 : 10);
                if (full) {
                    barWidth = 0;
                }
                ctx.beginPath();
                ctx.moveTo(barWidth, this.size / 2);
                ctx.lineTo(this.width - barWidth, this.size / 2);
                ctx.stroke();
            }
        },
        _drawBgShape: function(ctx, full=false) {
            ctx.fillStyle = this.layoutBackgroundColor;
            ctx.beginPath();
            if (this.layout === 'circle') {
                let rayon = this.size / 2;
                if (this.progressBarWeight === 'thin') {
                    rayon -= full ? this.size / 29 : this.size / 15;
                } else {
                    rayon -= full ? 0 : this.size / 10;
                }
                ctx.arc(this.size / 2, this.size / 2, rayon, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.layout === 'boxes') {
                let barWidth = this.size / (this.progressBarWeight === 'thin' ? 31 : 10);
                if (full) {
                    barWidth = 0;
                }
                ctx.fillStyle = this.layoutBackgroundColor;
                ctx.rect(barWidth, barWidth, this.width - barWidth * 2, this.size - barWidth * 2);
                ctx.fill();
                const gradient = ctx.createLinearGradient(0, this.width, 0, 0);
                gradient.addColorStop(0, '#ffffff24');
                gradient.addColorStop(1, this.layoutBackgroundColor);
                ctx.fillStyle = gradient;
                ctx.rect(barWidth, barWidth, this.width - barWidth * 2, this.size - barWidth * 2);
                ctx.fill();
                $(ctx.canvas).css({
                    'border-radius': '8px'
                });
            }
        },
        _drawProgressBar: function(ctx, nbUnit, totalUnit, thinLine) {
            ctx.strokeStyle = this.progressBarColor;
            ctx.lineWidth = thinLine ? this.size / 35 : this.size / 10;
            if (this.layout === 'circle') {
                ctx.beginPath();
                ctx.arc(this.size / 2, this.size / 2, this.size / 2 - this.size / 20, Math.PI / -2, (Math.PI * 2) * (nbUnit / totalUnit) + (Math.PI / -2));
                ctx.stroke();
            } else if (this.layout === 'boxes') {
                ctx.lineWidth *= 2;
                let pc = nbUnit / totalUnit * 100;
                const linesCoordFuncs = [ (linePc) => [0 + ctx.lineWidth / 2, 0, (this.width - ctx.lineWidth / 2) * linePc / 25 + ctx.lineWidth / 2, 0], (linePc) => [this.width, 0 + ctx.lineWidth / 2, this.width, (this.size - ctx.lineWidth / 2) * linePc / 25 + ctx.lineWidth / 2], (linePc) => [this.width - ((this.width - ctx.lineWidth / 2) * linePc / 25) - ctx.lineWidth / 2, this.size, this.width - ctx.lineWidth / 2, this.size], (linePc) => [0, this.size - ((this.size - ctx.lineWidth / 2) * linePc / 25) - ctx.lineWidth / 2, 0, this.size - ctx.lineWidth / 2], ];
                while (pc > 0 && linesCoordFuncs.length) {
                    const linePc = Math.min(pc, 25);
                    const lineCoord = (linesCoordFuncs.shift())(linePc);
                    ctx.beginPath();
                    ctx.moveTo(lineCoord[0], lineCoord[1]);
                    ctx.lineTo(lineCoord[2], lineCoord[3]);
                    ctx.stroke();
                    pc -= linePc;
                }
            }
        },
        _drawProgressBarBg: function(ctx, thinLine) {
            ctx.strokeStyle = this.progressBarColor;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = thinLine ? this.size / 35 : this.size / 10;
            if (this.layout === 'circle') {
                ctx.beginPath();
                ctx.arc(this.size / 2, this.size / 2, this.size / 2 - this.size / 20, 0, Math.PI * 2);
                ctx.stroke();
            } else if (this.layout === 'boxes') {
                ctx.lineWidth *= 2;
                const points = [[0 + ctx.lineWidth / 2, 0, this.width, 0], [this.width, 0 + ctx.lineWidth / 2, this.width, this.size], [0, this.size, this.width - ctx.lineWidth / 2, this.size], [0, 0, 0, this.size - ctx.lineWidth / 2], ];
                while (points.length) {
                    const point = points.shift();
                    ctx.beginPath();
                    ctx.moveTo(point[0], point[1]);
                    ctx.lineTo(point[2], point[3]);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        },
    });
    publicWidget.registry.countdown = CountdownWidget;
    return CountdownWidget;
});
;
/* /website/static/src/snippets/s_popup/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_popup', function(require) {
    'use strict';
    const config = require('web.config');
    const dom = require('web.dom');
    const publicWidget = require('web.public.widget');
    const utils = require('web.utils');
    const PopupWidget = publicWidget.Widget.extend({
        selector: '.s_popup',
        events: {
            'click .js_close_popup': '_onCloseClick',
            'hide.bs.modal': '_onHideModal',
            'show.bs.modal': '_onShowModal',
        },
        start: function() {
            this._popupAlreadyShown = !!utils.get_cookie(this.$el.attr('id'));
            if (!this._popupAlreadyShown) {
                this._bindPopup();
            }
            return this._super(...arguments);
        },
        destroy: function() {
            this._super.apply(this, arguments);
            $(document).off('mouseleave.open_popup');
            this.$target.find('.modal').modal('hide');
            clearTimeout(this.timeout);
        },
        _bindPopup: function() {
            const $main = this.$target.find('.modal');
            let display = $main.data('display');
            let delay = $main.data('showAfter');
            if (config.device.isMobile) {
                if (display === 'mouseExit') {
                    display = 'afterDelay';
                    delay = 5000;
                }
                this.$('.modal').removeClass('s_popup_middle').addClass('s_popup_bottom');
            }
            if (display === 'afterDelay') {
                this.timeout = setTimeout( () => this._showPopup(), delay);
            } else {
                $(document).on('mouseleave.open_popup', () => this._showPopup());
            }
        },
        _hidePopup: function() {
            this.$target.find('.modal').modal('hide');
        },
        _showPopup: function() {
            if (this._popupAlreadyShown) {
                return;
            }
            this.$target.find('.modal').modal('show');
        },
        _onCloseClick: function() {
            this._hidePopup();
        },
        _onHideModal: function() {
            const nbDays = this.$el.find('.modal').data('consentsDuration');
            utils.set_cookie(this.$el.attr('id'), true, nbDays * 24 * 60 * 60);
            this._popupAlreadyShown = true;
            this.$target.find('.media_iframe_video iframe').each( (i, iframe) => {
                iframe.src = '';
            }
            );
        },
        _onShowModal() {
            this.el.querySelectorAll('.media_iframe_video').forEach(media => {
                const iframe = media.querySelector('iframe');
                iframe.src = media.dataset.oeExpression || media.dataset.src;
            }
            );
        },
    });
    publicWidget.registry.popup = PopupWidget;
    function _updateScrollbar(ev) {
        const context = ev.data;
        const isOverflowing = dom.hasScrollableContent(context._element);
        if (context._isOverflowingWindow !== isOverflowing) {
            context._isOverflowingWindow = isOverflowing;
            context._checkScrollbar();
            context._setScrollbar();
            if (isOverflowing) {
                document.body.classList.add('modal-open');
            } else {
                document.body.classList.remove('modal-open');
                context._resetScrollbar();
            }
        }
    }
    const _baseShowElement = $.fn.modal.Constructor.prototype._showElement;
    $.fn.modal.Constructor.prototype._showElement = function() {
        _baseShowElement.apply(this, arguments);
        if (this._element.classList.contains('s_popup_no_backdrop')) {
            $(this._element).on('content_changed.update_scrollbar', this, _updateScrollbar);
            $(window).on('resize.update_scrollbar', this, _updateScrollbar);
            this._odooLoadEventCaptureHandler = _.debounce( () => _updateScrollbar({
                data: this
            }, 100));
            this._element.addEventListener('load', this._odooLoadEventCaptureHandler, true);
            _updateScrollbar({
                data: this
            });
        }
    }
    ;
    const _baseHideModal = $.fn.modal.Constructor.prototype._hideModal;
    $.fn.modal.Constructor.prototype._hideModal = function() {
        _baseHideModal.apply(this, arguments);
        this._element.classList.remove('s_popup_overflow_page');
        $(this._element).off('content_changed.update_scrollbar');
        $(window).off('resize.update_scrollbar');
        if (this._odooLoadEventCaptureHandler) {
            this._element.removeEventListener('load', this._odooLoadEventCaptureHandler, true);
            delete this._odooLoadEventCaptureHandler;
        }
    }
    ;
    const _baseSetScrollbar = $.fn.modal.Constructor.prototype._setScrollbar;
    $.fn.modal.Constructor.prototype._setScrollbar = function() {
        if (this._element.classList.contains('s_popup_no_backdrop')) {
            this._element.classList.toggle('s_popup_overflow_page', !!this._isOverflowingWindow);
            if (!this._isOverflowingWindow) {
                return;
            }
        }
        return _baseSetScrollbar.apply(this, arguments);
    }
    ;
    const _baseGetScrollbarWidth = $.fn.modal.Constructor.prototype._getScrollbarWidth;
    $.fn.modal.Constructor.prototype._getScrollbarWidth = function() {
        if (this._element.classList.contains('s_popup_no_backdrop') && !this._isOverflowingWindow) {
            return 0;
        }
        return _baseGetScrollbarWidth.apply(this, arguments);
    }
    ;
    return PopupWidget;
});
;
/* /website/static/src/snippets/s_table_of_content/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_table_of_content', function(require) {
    'use strict';
    const publicWidget = require('web.public.widget');
    const {extraMenuUpdateCallbacks} = require('website.content.menu');
    const TableOfContent = publicWidget.Widget.extend({
        selector: 'section .s_table_of_content_navbar_sticky',
        disabledInEditableMode: false,
        async start() {
            await this._super(...arguments);
            this._updateTableOfContentNavbarPosition();
            extraMenuUpdateCallbacks.push(this._updateTableOfContentNavbarPosition.bind(this));
        },
        destroy() {
            this.$target.css('top', '');
            this.$target.find('.s_table_of_content_navbar').css('top', '');
            this._super(...arguments);
        },
        _updateTableOfContentNavbarPosition() {
            let position = 0;
            const $fixedElements = $('.o_top_fixed_element');
            _.each($fixedElements, el => position += $(el).outerHeight());
            const isHorizontalNavbar = this.$target.hasClass('s_table_of_content_horizontal_navbar');
            this.$target.css('top', isHorizontalNavbar ? position : '');
            this.$target.find('.s_table_of_content_navbar').css('top', isHorizontalNavbar ? '' : position + 20);
            const $mainNavBar = $('#oe_main_menu_navbar');
            position += $mainNavBar.length ? $mainNavBar.outerHeight() : 0;
            position += isHorizontalNavbar ? this.$target.outerHeight() : 0;
            $().getScrollingElement().scrollspy({
                target: '.s_table_of_content_navbar',
                method: 'offset',
                offset: position + 100,
                alwaysKeepFirstActive: true
            });
        },
    });
    publicWidget.registry.anchorSlide.include({
        _computeExtraOffset() {
            let extraOffset = this._super(...arguments);
            if (this.$el.hasClass('table_of_content_link')) {
                const tableOfContentNavbarEl = this.$el.closest('.s_table_of_content_navbar_sticky.s_table_of_content_horizontal_navbar');
                if (tableOfContentNavbarEl.length > 0) {
                    extraOffset += $(tableOfContentNavbarEl).outerHeight();
                }
            }
            return extraOffset;
        },
    });
    publicWidget.registry.snippetTableOfContent = TableOfContent;
    return TableOfContent;
});
;
/* /website/static/src/snippets/s_chart/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_chart', function(require) {
    'use strict';
    const publicWidget = require('web.public.widget');
    const weUtils = require('web_editor.utils');
    const ChartWidget = publicWidget.Widget.extend({
        selector: '.s_chart',
        disabledInEditableMode: false,
        jsLibs: ['/web/static/lib/Chart/Chart.js', ],
        init: function(parent, options) {
            this._super.apply(this, arguments);
            this.style = window.getComputedStyle(document.documentElement);
        },
        start: function() {
            const data = JSON.parse(this.el.dataset.data);
            data.datasets.forEach(el => {
                if (Array.isArray(el.backgroundColor)) {
                    el.backgroundColor = el.backgroundColor.map(el => this._convertToCssColor(el));
                    el.borderColor = el.borderColor.map(el => this._convertToCssColor(el));
                } else {
                    el.backgroundColor = this._convertToCssColor(el.backgroundColor);
                    el.borderColor = this._convertToCssColor(el.borderColor);
                }
                el.borderWidth = this.el.dataset.borderWidth;
            }
            );
            const chartData = {
                type: this.el.dataset.type,
                data: data,
                options: {
                    legend: {
                        display: this.el.dataset.legendPosition !== 'none',
                        position: this.el.dataset.legendPosition,
                    },
                    tooltips: {
                        enabled: this.el.dataset.tooltipDisplay === 'true',
                    },
                    title: {
                        display: !!this.el.dataset.title,
                        text: this.el.dataset.title,
                    },
                },
            };
            if (this.el.dataset.type === 'radar') {
                chartData.options.scale = {
                    ticks: {
                        beginAtZero: true,
                    }
                };
            } else if (['pie', 'doughnut'].includes(this.el.dataset.type)) {
                chartData.options.tooltips.callbacks = {
                    label: (tooltipItem, data) => {
                        const label = data.datasets[tooltipItem.datasetIndex].label;
                        const secondLabel = data.labels[tooltipItem.index];
                        let final = label;
                        if (label) {
                            if (secondLabel) {
                                final = label + ' - ' + secondLabel;
                            }
                        } else if (secondLabel) {
                            final = secondLabel;
                        }
                        return final + ':' + data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index];
                    }
                    ,
                };
            } else {
                chartData.options.scales = {
                    xAxes: [{
                        stacked: this.el.dataset.stacked === 'true',
                        ticks: {
                            beginAtZero: true
                        },
                    }],
                    yAxes: [{
                        stacked: this.el.dataset.stacked === 'true',
                        ticks: {
                            beginAtZero: true
                        },
                    }],
                };
            }
            if (this.editableMode) {
                chartData.options.animation = {
                    duration: 0,
                };
            }
            const canvas = this.el.querySelector('canvas');
            this.chart = new window.Chart(canvas,chartData);
            return this._super.apply(this, arguments);
        },
        destroy: function() {
            if (this.chart) {
                this.chart.destroy();
                this.el.querySelectorAll('.chartjs-size-monitor').forEach(el => el.remove());
            }
            this._super.apply(this, arguments);
        },
        _convertToCssColor: function(color) {
            if (!color) {
                return 'transparent';
            }
            return weUtils.getCSSVariableValue(color, this.style) || color;
        },
    });
    publicWidget.registry.chart = ChartWidget;
    return ChartWidget;
});
;
/* /website/static/src/snippets/s_google_map/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_google_map', function(require) {
    'use strict';
    const publicWidget = require('web.public.widget');
    publicWidget.registry.GoogleMap = publicWidget.Widget.extend({
        selector: '.s_google_map',
        disabledInEditableMode: false,
        mapColors: {
            lightMonoMap: [{
                "featureType": "administrative.locality",
                "elementType": "all",
                "stylers": [{
                    "hue": "#2c2e33"
                }, {
                    "saturation": 7
                }, {
                    "lightness": 19
                }, {
                    "visibility": "on"
                }]
            }, {
                "featureType": "landscape",
                "elementType": "all",
                "stylers": [{
                    "hue": "#ffffff"
                }, {
                    "saturation": -100
                }, {
                    "lightness": 100
                }, {
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "poi",
                "elementType": "all",
                "stylers": [{
                    "hue": "#ffffff"
                }, {
                    "saturation": -100
                }, {
                    "lightness": 100
                }, {
                    "visibility": "off"
                }]
            }, {
                "featureType": "road",
                "elementType": "geometry",
                "stylers": [{
                    "hue": "#bbc0c4"
                }, {
                    "saturation": -93
                }, {
                    "lightness": 31
                }, {
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "road",
                "elementType": "labels",
                "stylers": [{
                    "hue": "#bbc0c4"
                }, {
                    "saturation": -93
                }, {
                    "lightness": 31
                }, {
                    "visibility": "on"
                }]
            }, {
                "featureType": "road.arterial",
                "elementType": "labels",
                "stylers": [{
                    "hue": "#bbc0c4"
                }, {
                    "saturation": -93
                }, {
                    "lightness": -2
                }, {
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "road.local",
                "elementType": "geometry",
                "stylers": [{
                    "hue": "#e9ebed"
                }, {
                    "saturation": -90
                }, {
                    "lightness": -8
                }, {
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "transit",
                "elementType": "all",
                "stylers": [{
                    "hue": "#e9ebed"
                }, {
                    "saturation": 10
                }, {
                    "lightness": 69
                }, {
                    "visibility": "on"
                }]
            }, {
                "featureType": "water",
                "elementType": "all",
                "stylers": [{
                    "hue": "#e9ebed"
                }, {
                    "saturation": -78
                }, {
                    "lightness": 67
                }, {
                    "visibility": "simplified"
                }]
            }],
            lillaMap: [{
                elementType: "labels",
                stylers: [{
                    saturation: -20
                }]
            }, {
                featureType: "poi",
                elementType: "labels",
                stylers: [{
                    visibility: "off"
                }]
            }, {
                featureType: 'road.highway',
                elementType: 'labels',
                stylers: [{
                    visibility: "off"
                }]
            }, {
                featureType: "road.local",
                elementType: "labels.icon",
                stylers: [{
                    visibility: "off"
                }]
            }, {
                featureType: "road.arterial",
                elementType: "labels.icon",
                stylers: [{
                    visibility: "off"
                }]
            }, {
                featureType: "road",
                elementType: "geometry.stroke",
                stylers: [{
                    visibility: "off"
                }]
            }, {
                featureType: "transit",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "poi",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "poi.government",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "poi.sport_complex",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "poi.attraction",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "poi.business",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "transit",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "transit.station",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "landscape",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "road",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "road.highway",
                elementType: "geometry.fill",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "water",
                elementType: "geometry",
                stylers: [{
                    hue: '#2d313f'
                }, {
                    visibility: "on"
                }, {
                    lightness: 5
                }, {
                    saturation: -20
                }]
            }],
            blueMap: [{
                stylers: [{
                    hue: "#00ffe6"
                }, {
                    saturation: -20
                }]
            }, {
                featureType: "road",
                elementType: "geometry",
                stylers: [{
                    lightness: 100
                }, {
                    visibility: "simplified"
                }]
            }, {
                featureType: "road",
                elementType: "labels",
                stylers: [{
                    visibility: "off"
                }]
            }],
            retroMap: [{
                "featureType": "administrative",
                "elementType": "all",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "lightness": 33
                }]
            }, {
                "featureType": "landscape",
                "elementType": "all",
                "stylers": [{
                    "color": "#f2e5d4"
                }]
            }, {
                "featureType": "poi.park",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#c5dac6"
                }]
            }, {
                "featureType": "poi.park",
                "elementType": "labels",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "lightness": 20
                }]
            }, {
                "featureType": "road",
                "elementType": "all",
                "stylers": [{
                    "lightness": 20
                }]
            }, {
                "featureType": "road.highway",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#c5c6c6"
                }]
            }, {
                "featureType": "road.arterial",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#e4d7c6"
                }]
            }, {
                "featureType": "road.local",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#fbfaf7"
                }]
            }, {
                "featureType": "water",
                "elementType": "all",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "color": "#acbcc9"
                }]
            }],
            flatMap: [{
                "stylers": [{
                    "visibility": "off"
                }]
            }, {
                "featureType": "road",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "color": "#ffffff"
                }]
            }, {
                "featureType": "road.arterial",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "color": "#fee379"
                }]
            }, {
                "featureType": "road.highway",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "color": "#fee379"
                }]
            }, {
                "featureType": "landscape",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "color": "#f3f4f4"
                }]
            }, {
                "featureType": "water",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "color": "#7fc8ed"
                }]
            }, {}, {
                "featureType": "road",
                "elementType": "labels",
                "stylers": [{
                    "visibility": "on"
                }]
            }, {
                "featureType": "poi.park",
                "elementType": "geometry.fill",
                "stylers": [{
                    "visibility": "on"
                }, {
                    "color": "#83cead"
                }]
            }, {
                "elementType": "labels",
                "stylers": [{
                    "visibility": "on"
                }]
            }, {
                "featureType": "landscape.man_made",
                "elementType": "geometry",
                "stylers": [{
                    "weight": 0.9
                }, {
                    "visibility": "off"
                }]
            }],
            cobaltMap: [{
                "featureType": "all",
                "elementType": "all",
                "stylers": [{
                    "invert_lightness": true
                }, {
                    "saturation": 10
                }, {
                    "lightness": 30
                }, {
                    "gamma": 0.5
                }, {
                    "hue": "#435158"
                }]
            }],
            cupertinoMap: [{
                "featureType": "water",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#a2daf2"
                }]
            }, {
                "featureType": "landscape.man_made",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#f7f1df"
                }]
            }, {
                "featureType": "landscape.natural",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#d0e3b4"
                }]
            }, {
                "featureType": "landscape.natural.terrain",
                "elementType": "geometry",
                "stylers": [{
                    "visibility": "off"
                }]
            }, {
                "featureType": "poi.park",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#bde6ab"
                }]
            }, {
                "featureType": "poi",
                "elementType": "labels",
                "stylers": [{
                    "visibility": "off"
                }]
            }, {
                "featureType": "poi.medical",
                "elementType": "geometry",
                "stylers": [{
                    "color": "#fbd3da"
                }]
            }, {
                "featureType": "poi.business",
                "stylers": [{
                    "visibility": "off"
                }]
            }, {
                "featureType": "road",
                "elementType": "geometry.stroke",
                "stylers": [{
                    "visibility": "off"
                }]
            }, {
                "featureType": "road",
                "elementType": "labels",
                "stylers": [{
                    "visibility": "off"
                }]
            }, {
                "featureType": "road.highway",
                "elementType": "geometry.fill",
                "stylers": [{
                    "color": "#ffe15f"
                }]
            }, {
                "featureType": "road.highway",
                "elementType": "geometry.stroke",
                "stylers": [{
                    "color": "#efd151"
                }]
            }, {
                "featureType": "road.arterial",
                "elementType": "geometry.fill",
                "stylers": [{
                    "color": "#ffffff"
                }]
            }, {
                "featureType": "road.local",
                "elementType": "geometry.fill",
                "stylers": [{
                    "color": "black"
                }]
            }, {
                "featureType": "transit.station.airport",
                "elementType": "geometry.fill",
                "stylers": [{
                    "color": "#cfb2db"
                }]
            }],
            carMap: [{
                "featureType": "administrative",
                "stylers": [{
                    "visibility": "off"
                }]
            }, {
                "featureType": "poi",
                "stylers": [{
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "road",
                "stylers": [{
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "water",
                "stylers": [{
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "transit",
                "stylers": [{
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "landscape",
                "stylers": [{
                    "visibility": "simplified"
                }]
            }, {
                "featureType": "road.highway",
                "stylers": [{
                    "visibility": "off"
                }]
            }, {
                "featureType": "road.local",
                "stylers": [{
                    "visibility": "on"
                }]
            }, {
                "featureType": "road.highway",
                "elementType": "geometry",
                "stylers": [{
                    "visibility": "on"
                }]
            }, {
                "featureType": "water",
                "stylers": [{
                    "color": "#84afa3"
                }, {
                    "lightness": 52
                }]
            }, {
                "stylers": [{
                    "saturation": -77
                }]
            }, {
                "featureType": "road"
            }],
            bwMap: [{
                stylers: [{
                    hue: "#00ffe6"
                }, {
                    saturation: -100
                }]
            }, {
                featureType: "road",
                elementType: "geometry",
                stylers: [{
                    lightness: 100
                }, {
                    visibility: "simplified"
                }]
            }, {
                featureType: "road",
                elementType: "labels",
                stylers: [{
                    visibility: "off"
                }]
            }],
        },
        async start() {
            await this._super(...arguments);
            if (typeof google !== 'object' || typeof google.maps !== 'object') {
                await new Promise(resolve => {
                    this.trigger_up('gmap_api_request', {
                        editableMode: this.editableMode,
                        onSuccess: () => resolve(),
                    });
                }
                );
                return;
            }
            const std = [];
            new google.maps.StyledMapType(std,{
                name: "Std Map"
            });
            const myOptions = {
                zoom: 12,
                center: new google.maps.LatLng(50.854975,4.3753899),
                mapTypeId: google.maps.MapTypeId.ROADMAP,
                panControl: false,
                zoomControl: false,
                mapTypeControl: false,
                streetViewControl: false,
                scrollwheel: false,
                mapTypeControlOptions: {
                    mapTypeIds: [google.maps.MapTypeId.ROADMAP, 'map_style']
                }
            };
            const mapC = this.$('.map_container');
            const map = new google.maps.Map(mapC.get(0),myOptions);
            const p = this.el.dataset.mapGps.substring(1).slice(0, -1).split(',');
            const gps = new google.maps.LatLng(p[0],p[1]);
            map.setCenter(gps);
            google.maps.event.addDomListener(window, 'resize', () => {
                map.setCenter(gps);
            }
            );
            const markerOptions = {
                map: map,
                animation: google.maps.Animation.DROP,
                position: new google.maps.LatLng(p[0],p[1])
            };
            if (this.el.dataset.pinStyle === 'flat') {
                markerOptions.icon = '/website/static/src/img/snippets_thumbs/s_google_map_marker.png';
            }
            new google.maps.Marker(markerOptions);
            map.setMapTypeId(google.maps.MapTypeId[this.el.dataset.mapType]);
            map.setZoom(parseInt(this.el.dataset.mapZoom));
            const mapColorAttr = this.el.dataset.mapColor;
            if (mapColorAttr) {
                const mapColor = this.mapColors[mapColorAttr];
                map.mapTypes.set('map_style', new google.maps.StyledMapType(mapColor,{
                    name: "Styled Map"
                }));
                map.setMapTypeId('map_style');
            }
        },
    });
});
;
/* /website/static/src/snippets/s_dynamic_snippet/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_dynamic_snippet', function(require) {
    'use strict';
    const core = require('web.core');
    const config = require('web.config');
    const publicWidget = require('web.public.widget');
    const DynamicSnippet = publicWidget.Widget.extend({
        selector: '.s_dynamic_snippet',
        xmlDependencies: ['/website/static/src/snippets/s_dynamic_snippet/000.xml'],
        read_events: {
            'click [data-url]': '_onCallToAction',
        },
        disabledInEditableMode: false,
        init: function() {
            this._super.apply(this, arguments);
            this.data = [];
            this.renderedContent = '';
            this.isDesplayedAsMobile = config.device.isMobile;
            this.uniqueId = _.uniqueId('s_dynamic_snippet_');
            this.template_key = 'website.s_dynamic_snippet.grid';
        },
        willStart: function() {
            return this._super.apply(this, arguments).then( () => Promise.all([this._fetchData(), this._manageWarningMessageVisibility()]));
        },
        start: function() {
            return this._super.apply(this, arguments).then( () => {
                this._setupSizeChangedManagement(true);
                this._render();
                this._toggleVisibility(true);
            }
            );
        },
        destroy: function() {
            this._toggleVisibility(false);
            this._setupSizeChangedManagement(false);
            this._clearContent();
            this._super.apply(this, arguments);
        },
        _clearContent: function() {
            const $dynamicSnippetTemplate = this.$el.find('.dynamic_snippet_template');
            if ($dynamicSnippetTemplate) {
                $dynamicSnippetTemplate.html('');
            }
        },
        _isConfigComplete: function() {
            return this.$el.get(0).dataset.filterId !== undefined && this.$el.get(0).dataset.templateKey !== undefined;
        },
        _getSearchDomain: function() {
            return [];
        },
        _fetchData: function() {
            if (this._isConfigComplete()) {
                return this._rpc({
                    'route': '/website/snippet/filters',
                    'params': {
                        'filter_id': parseInt(this.$el.get(0).dataset.filterId),
                        'template_key': this.$el.get(0).dataset.templateKey,
                        'limit': parseInt(this.$el.get(0).dataset.numberOfRecords),
                        'search_domain': this._getSearchDomain()
                    },
                }).then( (data) => {
                    this.data = data;
                }
                );
            } else {
                return new Promise( (resolve) => {
                    this.data = [];
                    resolve();
                }
                );
            }
        },
        _mustMessageWarningBeHidden: function() {
            return this._isConfigComplete() || !this.editableMode;
        },
        _manageWarningMessageVisibility: async function() {
            this.$el.find('.missing_option_warning').toggleClass('d-none', this._mustMessageWarningBeHidden());
        },
        _prepareContent: function() {
            if (this.$target[0].dataset.numberOfElements && this.$target[0].dataset.numberOfElementsSmallDevices) {
                this.renderedContent = core.qweb.render(this.template_key, this._getQWebRenderOptions());
            } else {
                this.renderedContent = '';
            }
        },
        _getQWebRenderOptions: function() {
            return {
                chunkSize: parseInt(config.device.isMobile ? this.$target[0].dataset.numberOfElementsSmallDevices : this.$target[0].dataset.numberOfElements),
                data: this.data,
                uniqueId: this.uniqueId
            };
        },
        _render: function() {
            if (this.data.length) {
                this._prepareContent();
            } else {
                this.renderedContent = '';
            }
            this._renderContent();
        },
        _renderContent: function() {
            this.$el.find('.dynamic_snippet_template').html(this.renderedContent);
        },
        _setupSizeChangedManagement: function(enable) {
            if (enable === true) {
                config.device.bus.on('size_changed', this, this._onSizeChanged);
            } else {
                config.device.bus.off('size_changed', this, this._onSizeChanged);
            }
        },
        _toggleVisibility: function(visible) {
            this.$el.toggleClass('d-none', !visible);
        },
        _onCallToAction: function(ev) {
            window.location = $(ev.currentTarget).attr('data-url');
        },
        _onSizeChanged: function(size) {
            if (this.isDesplayedAsMobile !== config.device.isMobile) {
                this.isDesplayedAsMobile = config.device.isMobile;
                this._render();
            }
        },
    });
    publicWidget.registry.dynamic_snippet = DynamicSnippet;
    return DynamicSnippet;
});
;
/* /website/static/src/snippets/s_dynamic_snippet_carousel/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.s_dynamic_snippet_carousel', function(require) {
    'use strict';
    const config = require('web.config');
    const core = require('web.core');
    const publicWidget = require('web.public.widget');
    const DynamicSnippet = require('website.s_dynamic_snippet');
    const DynamicSnippetCarousel = DynamicSnippet.extend({
        selector: '.s_dynamic_snippet_carousel',
        xmlDependencies: (DynamicSnippet.prototype.xmlDependencies || []).concat(['/website/static/src/snippets/s_dynamic_snippet_carousel/000.xml']),
        init: function() {
            this._super.apply(this, arguments);
            this.template_key = 'website.s_dynamic_snippet.carousel';
        },
        _getQWebRenderParams: function() {
            return Object.assign(this._super.apply(this, arguments), {
                interval: parseInt(this.$target[0].dataset.carouselInterval),
            }, );
        },
    });
    publicWidget.registry.dynamic_snippet_carousel = DynamicSnippetCarousel;
    return DynamicSnippetCarousel;
});
;
/* /website_sale/static/src/snippets/s_dynamic_snippet_products/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.s_dynamic_snippet_products', function(require) {
    'use strict';
    const config = require('web.config');
    const core = require('web.core');
    const publicWidget = require('web.public.widget');
    const DynamicSnippetCarousel = require('website.s_dynamic_snippet_carousel');
    const DynamicSnippetProducts = DynamicSnippetCarousel.extend({
        selector: '.s_dynamic_snippet_products',
        _isConfigComplete: function() {
            return this._super.apply(this, arguments) && this.$el.get(0).dataset.productCategoryId !== undefined;
        },
        _mustMessageWarningBeHidden: function() {
            const isInitialDrop = this.$el.get(0).dataset.templateKey === undefined;
            return isInitialDrop || this._super.apply(this, arguments);
        },
        _getSearchDomain: function() {
            const searchDomain = this._super.apply(this, arguments);
            const productCategoryId = parseInt(this.$el.get(0).dataset.productCategoryId);
            if (productCategoryId >= 0) {
                searchDomain.push(['public_categ_ids', 'child_of', productCategoryId]);
            }
            return searchDomain;
        },
    });
    publicWidget.registry.dynamic_snippet_products = DynamicSnippetProducts;
    return DynamicSnippetProducts;
});
;
/* /website_enterprise/static/src/js/website_enterprise.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website.home_menu', function(require) {
    'use strict';
    var session = require('web.session');
    var websiteNavbarData = require('website.navbar');
    websiteNavbarData.WebsiteNavbar.include({
        events: _.extend({}, websiteNavbarData.WebsiteNavbar.prototype.events || {}, {
            'click .o_menu_toggle': '_onMenuToggleClick',
        }),
        _onMenuToggleClick: function(ev) {
            ev.preventDefault();
            var $button = $(ev.currentTarget);
            if (!$button.hasClass('fa')) {
                return;
            }
            $button.removeClass('fa fa-th').append($('<span/>', {
                'class': 'fa fa-spin fa-spinner'
            }));
            var url = '/web#home';
            window.location.href = url;
        },
    });
});
;
/* /website_mail/static/src/js/follow.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_mail.follow', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    publicWidget.registry.follow = publicWidget.Widget.extend({
        selector: '#wrapwrap:has(.js_follow)',
        disabledInEditableMode: false,
        start: function() {
            var self = this;
            this.isUser = false;
            var $jsFollowEls = this.$el.find('.js_follow');
            var always = function(data) {
                self.isUser = data[0].is_user;
                const $jsFollowToEnable = $jsFollowEls.filter(function() {
                    const model = this.dataset.object;
                    return model in data[1] && data[1][model].includes(parseInt(this.dataset.id));
                });
                self._toggleSubscription(true, data[0].email, $jsFollowToEnable);
                self._toggleSubscription(false, data[0].email, $jsFollowEls.not($jsFollowToEnable));
                $jsFollowEls.removeClass('d-none');
            };
            const records = {};
            for (const el of $jsFollowEls) {
                const model = el.dataset.object;
                if (!(model in records)) {
                    records[model] = [];
                }
                records[model].push(parseInt(el.dataset.id));
            }
            this._rpc({
                route: '/website_mail/is_follower',
                params: {
                    records: records,
                },
            }).then(always).guardedCatch(always);
            if (!this.editableMode) {
                $('.js_follow > .input-group-append.d-none').removeClass('d-none');
                this.$target.find('.js_follow_btn, .js_unfollow_btn').on('click', function(event) {
                    event.preventDefault();
                    self._onClick(event);
                });
            }
            return this._super.apply(this, arguments);
        },
        _toggleSubscription: function(follow, email, $jsFollowEls) {
            if (follow) {
                this._updateSubscriptionDOM(follow, email, $jsFollowEls);
            } else {
                for (const el of $jsFollowEls) {
                    const follow = !email && el.getAttribute('data-unsubscribe');
                    this._updateSubscriptionDOM(follow, email, $(el));
                }
            }
        },
        _updateSubscriptionDOM: function(follow, email, $jsFollowEls) {
            $jsFollowEls.find('input.js_follow_email').val(email || "").attr("disabled", email && (follow || this.isUser) ? "disabled" : false);
            $jsFollowEls.attr("data-follow", follow ? 'on' : 'off');
        },
        _onClick: function(ev) {
            var self = this;
            var $jsFollow = $(ev.currentTarget).closest('.js_follow');
            var $email = $jsFollow.find(".js_follow_email");
            if ($email.length && !$email.val().match(/.+@.+/)) {
                $jsFollow.addClass('o_has_error').find('.form-control, .custom-select').addClass('is-invalid');
                return false;
            }
            $jsFollow.removeClass('o_has_error').find('.form-control, .custom-select').removeClass('is-invalid');
            var email = $email.length ? $email.val() : false;
            if (email || this.isUser) {
                this._rpc({
                    route: '/website_mail/follow',
                    params: {
                        'id': +$jsFollow.data('id'),
                        'object': $jsFollow.data('object'),
                        'message_is_follower': $jsFollow.attr("data-follow") || "off",
                        'email': email,
                    },
                }).then(function(follow) {
                    self._toggleSubscription(follow, email, $jsFollow);
                });
            }
        },
    });
});
;
/* /website_form/static/src/snippets/s_website_form/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_form.s_website_form', function(require) {
    'use strict';
    var core = require('web.core');
    var time = require('web.time');
    const {ReCaptcha} = require('google_recaptcha.ReCaptchaV3');
    var ajax = require('web.ajax');
    var publicWidget = require('web.public.widget');
    const dom = require('web.dom');
    var _t = core._t;
    var qweb = core.qweb;
    publicWidget.registry.s_website_form = publicWidget.Widget.extend({
        selector: '.s_website_form form, form.s_website_form',
        xmlDependencies: ['/website_form/static/src/xml/website_form.xml'],
        events: {
            'click .s_website_form_send, .o_website_form_send': 'send',
        },
        init: function() {
            this._super(...arguments);
            this._recaptcha = new ReCaptcha();
            this.__started = new Promise(resolve => this.__startResolve = resolve);
        },
        willStart: function() {
            const res = this._super(...arguments);
            if (!this.$target[0].classList.contains('s_website_form_no_recaptcha')) {
                this._recaptchaLoaded = true;
                this._recaptcha.loadLibs();
            }
            return res;
        },
        start: function() {
            var self = this;
            var datepickers_options = {
                minDate: moment({
                    y: 1000
                }),
                maxDate: moment({
                    y: 9999,
                    M: 11,
                    d: 31
                }),
                calendarWeeks: true,
                icons: {
                    time: 'fa fa-clock-o',
                    date: 'fa fa-calendar',
                    next: 'fa fa-chevron-right',
                    previous: 'fa fa-chevron-left',
                    up: 'fa fa-chevron-up',
                    down: 'fa fa-chevron-down',
                },
                locale: moment.locale(),
                format: time.getLangDatetimeFormat(),
            };
            this.$target.find('.s_website_form_datetime, .o_website_form_datetime').datetimepicker(datepickers_options);
            datepickers_options.format = time.getLangDateFormat();
            this.$target.find('.s_website_form_date, .o_website_form_date').datetimepicker(datepickers_options);
            var $values = $('[data-for=' + this.$target.attr('id') + ']');
            if ($values.length) {
                var values = JSON.parse($values.data('values').replace('False', '""').replace('None', '""').replace(/'/g, '"'));
                var fields = _.pluck(this.$target.serializeArray(), 'name');
                _.each(fields, function(field) {
                    if (_.has(values, field)) {
                        var $field = self.$target.find('input[name="' + field + '"], textarea[name="' + field + '"]');
                        if (!$field.val()) {
                            $field.val(values[field]);
                            $field.data('website_form_original_default_value', $field.val());
                        }
                    }
                });
            }
            return this._super(...arguments).then( () => this.__startResolve());
        },
        destroy: function() {
            this._super.apply(this, arguments);
            this.$target.find('button').off('click');
            this.$target[0].reset();
            this.$target.find('.o_has_error').removeClass('o_has_error').find('.form-control, .custom-select').removeClass('is-invalid');
            this.$target.find('#s_website_form_result, #o_website_form_result').empty();
            this.$target.removeClass('d-none');
            this.$target.parent().find('.s_website_form_end_message').addClass('d-none');
        },
        send: async function(e) {
            e.preventDefault();
            this.$target.find('.s_website_form_send, .o_website_form_send').addClass('disabled').attr('disabled', 'disabled');
            var self = this;
            self.$target.find('#s_website_form_result, #o_website_form_result').empty();
            if (!self.check_error_fields({})) {
                self.update_status('error', _t("Please fill in the form correctly."));
                return false;
            }
            this.form_fields = this.$target.serializeArray();
            $.each(this.$target.find('input[type=file]'), function(outer_index, input) {
                $.each($(input).prop('files'), function(index, file) {
                    self.form_fields.push({
                        name: input.name + '[' + outer_index + '][' + index + ']',
                        value: file
                    });
                });
            });
            var form_values = {};
            _.each(this.form_fields, function(input) {
                if (input.name in form_values) {
                    if (Array.isArray(form_values[input.name])) {
                        form_values[input.name].push(input.value);
                    } else {
                        form_values[input.name] = [form_values[input.name], input.value];
                    }
                } else {
                    if (input.value !== '') {
                        form_values[input.name] = input.value;
                    }
                }
            });
            this.$target.find('.s_website_form_field:not(.s_website_form_custom)').find('.s_website_form_date, .s_website_form_datetime').each(function() {
                var date = $(this).datetimepicker('viewDate').clone().locale('en');
                var format = 'YYYY-MM-DD';
                if ($(this).hasClass('s_website_form_datetime')) {
                    date = date.utc();
                    format = 'YYYY-MM-DD HH:mm:ss';
                }
                form_values[$(this).find('input').attr('name')] = date.format(format);
            });
            if (this._recaptchaLoaded) {
                const tokenObj = await this._recaptcha.getToken('website_form');
                if (tokenObj.token) {
                    form_values['recaptcha_token_response'] = tokenObj.token;
                } else if (tokenObj.error) {
                    self.update_status('error', tokenObj.error);
                    return false;
                }
            }
            ajax.post(this.$target.attr('action') + (this.$target.data('force_action') || this.$target.data('model_name')), form_values).then(function(result_data) {
                self.$target.find('.s_website_form_send, .o_website_form_send').removeAttr('disabled').removeClass('disabled');
                result_data = JSON.parse(result_data);
                if (!result_data.id) {
                    self.update_status('error', result_data.error ? result_data.error : false);
                    if (result_data.error_fields) {
                        self.check_error_fields(result_data.error_fields);
                    }
                } else {
                    let successMode = self.$target[0].dataset.successMode;
                    let successPage = self.$target[0].dataset.successPage;
                    if (!successMode) {
                        successPage = self.$target.attr('data-success_page');
                        successMode = successPage ? 'redirect' : 'nothing';
                    }
                    switch (successMode) {
                    case 'redirect':
                        successPage = successPage.startsWith("/#") ? successPage.slice(1) : successPage;
                        if (successPage.charAt(0) === "#") {
                            dom.scrollTo($(successPage)[0], {
                                duration: 500,
                                extraOffset: 0,
                            });
                        } else {
                            $(window.location).attr('href', successPage);
                        }
                        break;
                    case 'message':
                        self.$target[0].classList.add('d-none');
                        self.$target[0].parentElement.querySelector('.s_website_form_end_message').classList.remove('d-none');
                        break;
                    default:
                        self.update_status('success');
                        break;
                    }
                    self.$target[0].reset();
                }
            }).guardedCatch(function() {
                self.update_status('error');
            });
        },
        check_error_fields: function(error_fields) {
            var self = this;
            var form_valid = true;
            this.$target.find('.form-field, .s_website_form_field').each(function(k, field) {
                var $field = $(field);
                var field_name = $field.find('.col-form-label').attr('for');
                var inputs = $field.find('.s_website_form_input, .o_website_form_input').not('#editable_select');
                var invalid_inputs = inputs.toArray().filter(function(input, k, inputs) {
                    if (input.required && input.type === 'checkbox') {
                        var checkboxes = _.filter(inputs, function(input) {
                            return input.required && input.type === 'checkbox';
                        });
                        return !_.any(checkboxes, checkbox => checkbox.checked);
                    } else if ($(input).hasClass('s_website_form_date') || $(input).hasClass('o_website_form_date')) {
                        if (!self.is_datetime_valid(input.value, 'date')) {
                            return true;
                        }
                    } else if ($(input).hasClass('s_website_form_datetime') || $(input).hasClass('o_website_form_datetime')) {
                        if (!self.is_datetime_valid(input.value, 'datetime')) {
                            return true;
                        }
                    }
                    return !input.checkValidity();
                });
                $field.removeClass('o_has_error').find('.form-control, .custom-select').removeClass('is-invalid');
                if (invalid_inputs.length || error_fields[field_name]) {
                    $field.addClass('o_has_error').find('.form-control, .custom-select').addClass('is-invalid');
                    if (_.isString(error_fields[field_name])) {
                        $field.popover({
                            content: error_fields[field_name],
                            trigger: 'hover',
                            container: 'body',
                            placement: 'top'
                        });
                        $field.data("bs.popover").config.content = error_fields[field_name];
                        $field.popover('show');
                    }
                    form_valid = false;
                }
            });
            return form_valid;
        },
        is_datetime_valid: function(value, type_of_date) {
            if (value === "") {
                return true;
            } else {
                try {
                    this.parse_date(value, type_of_date);
                    return true;
                } catch (e) {
                    return false;
                }
            }
        },
        parse_date: function(value, type_of_date, value_if_empty) {
            var date_pattern = time.getLangDateFormat()
              , time_pattern = time.getLangTimeFormat();
            var date_pattern_wo_zero = date_pattern.replace('MM', 'M').replace('DD', 'D')
              , time_pattern_wo_zero = time_pattern.replace('HH', 'H').replace('mm', 'm').replace('ss', 's');
            switch (type_of_date) {
            case 'datetime':
                var datetime = moment(value, [date_pattern + ' ' + time_pattern, date_pattern_wo_zero + ' ' + time_pattern_wo_zero], true);
                if (datetime.isValid()) {
                    return time.datetime_to_str(datetime.toDate());
                }
                throw new Error(_.str.sprintf(_t("'%s' is not a correct datetime"), value));
            case 'date':
                var date = moment(value, [date_pattern, date_pattern_wo_zero], true);
                if (date.isValid()) {
                    return time.date_to_str(date.toDate());
                }
                throw new Error(_.str.sprintf(_t("'%s' is not a correct date"), value));
            }
            return value;
        },
        update_status: function(status, message) {
            if (status !== 'success') {
                this.$target.find('.s_website_form_send, .o_website_form_send').removeAttr('disabled').removeClass('disabled');
            }
            var $result = this.$('#s_website_form_result, #o_website_form_result');
            if (status === 'error' && !message) {
                message = _t("An error has occured, the form has not been sent.");
            }
            this.__started.then( () => $result.replaceWith(qweb.render(`website_form.status_${status}`, {
                message: message,
            })));
        },
    });
});
;
/* /website_blog/static/src/js/contentshare.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_blog.contentshare', function(require) {
    'use strict';
    const dom = require('web.dom');
    $.fn.share = function(options) {
        var option = $.extend($.fn.share.defaults, options);
        var selected_text = "";
        $.extend($.fn.share, {
            init: function(shareable) {
                var self = this;
                $.fn.share.defaults.shareable = shareable;
                $.fn.share.defaults.shareable.on('mouseup', function() {
                    if ($(this).parents('body.editor_enable').length === 0) {
                        self.popOver();
                    }
                });
                $.fn.share.defaults.shareable.on('mousedown', function() {
                    self.destroy();
                });
            },
            getContent: function() {
                var $popover_content = $('<div class="h4 m-0"/>');
                if ($('.o_wblog_title, .o_wblog_post_content_field').hasClass('js_comment')) {
                    selected_text = this.getSelection('string');
                    var $btn_c = $('<a class="o_share_comment btn btn-link px-2" href="#"/>').append($('<i class="fa fa-lg fa-comment"/>'));
                    $popover_content.append($btn_c);
                }
                if ($('.o_wblog_title, .o_wblog_post_content_field').hasClass('js_tweet')) {
                    var tweet = '"%s" - %s';
                    var baseLength = tweet.replace(/%s/g, '').length;
                    var selectedText = this.getSelection('string').substring(0, option.maxLength - baseLength - 23);
                    var text = window.btoa(encodeURIComponent(_.str.sprintf(tweet, selectedText, window.location.href)));
                    $popover_content.append(_.str.sprintf("<a onclick=\"window.open('%s' + atob('%s'), '_%s','location=yes,height=570,width=520,scrollbars=yes,status=yes')\"><i class=\"ml4 mr4 fa fa-twitter fa-lg\"/></a>", option.shareLink, text, option.target));
                }
                return $popover_content;
            },
            commentEdition: function() {
                $(".o_portal_chatter_composer_form textarea").val('"' + selected_text + '" ').focus();
                const commentsEl = $('#o_wblog_post_comments')[0];
                if (commentsEl) {
                    dom.scrollTo(commentsEl).then( () => {
                        window.location.hash = 'blog_post_comment_quote';
                    }
                    );
                }
            },
            getSelection: function(share) {
                if (window.getSelection) {
                    var selection = window.getSelection();
                    if (!selection || selection.rangeCount === 0) {
                        return "";
                    }
                    if (share === 'string') {
                        return String(selection.getRangeAt(0)).replace(/\s{2,}/g, ' ');
                    } else {
                        return selection.getRangeAt(0);
                    }
                } else if (document.selection) {
                    if (share === 'string') {
                        return document.selection.createRange().text.replace(/\s{2,}/g, ' ');
                    } else {
                        return document.selection.createRange();
                    }
                }
            },
            popOver: function() {
                this.destroy();
                if (this.getSelection('string').length < option.minLength) {
                    return;
                }
                var data = this.getContent();
                var range = this.getSelection();
                var newNode = document.createElement("span");
                range.insertNode(newNode);
                newNode.className = option.className;
                var $pop = $(newNode);
                $pop.popover({
                    trigger: 'manual',
                    placement: option.placement,
                    html: true,
                    content: function() {
                        return data;
                    }
                }).popover('show');
                $('.o_share_comment').on('click', this.commentEdition);
            },
            destroy: function() {
                var $span = $('span.' + option.className);
                $span.popover('hide');
                $span.remove();
            }
        });
        $.fn.share.init(this);
    }
    ;
    $.fn.share.defaults = {
        shareLink: "http://twitter.com/intent/tweet?text=",
        minLength: 5,
        maxLength: 140,
        target: "blank",
        className: "share",
        placement: "top",
    };
});
;
/* /website_blog/static/src/js/website_blog.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_blog.website_blog', function(require) {
    'use strict';
    var core = require('web.core');
    const dom = require('web.dom');
    const publicWidget = require('web.public.widget');
    publicWidget.registry.websiteBlog = publicWidget.Widget.extend({
        selector: '.website_blog',
        events: {
            'click #o_wblog_next_container': '_onNextBlogClick',
            'click #o_wblog_post_content_jump': '_onContentAnchorClick',
            'click .o_twitter, .o_facebook, .o_linkedin, .o_google, .o_twitter_complete, .o_facebook_complete, .o_linkedin_complete, .o_google_complete': '_onShareArticle',
        },
        start: function() {
            $('.js_tweet, .js_comment').share({});
            return this._super.apply(this, arguments);
        },
        _onNextBlogClick: function(ev) {
            ev.preventDefault();
            var self = this;
            var $el = $(ev.currentTarget);
            var nexInfo = $el.find('#o_wblog_next_post_info').data();
            $el.find('.o_record_cover_container').addClass(nexInfo.size + ' ' + nexInfo.text).end().find('.o_wblog_toggle').toggleClass('d-none');
            const placeholder = document.createElement('div');
            placeholder.style.minHeight = '100vh';
            this.$('#o_wblog_next_container').append(placeholder);
            _.defer(function() {
                self._forumScrollAction($el, 300, function() {
                    window.location.href = nexInfo.url;
                });
            });
        },
        _onContentAnchorClick: function(ev) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            var $el = $(ev.currentTarget.hash);
            this._forumScrollAction($el, 500, function() {
                window.location.hash = 'blog_content';
            });
        },
        _onShareArticle: function(ev) {
            ev.preventDefault();
            var url = '';
            var $element = $(ev.currentTarget);
            var blogPostTitle = encodeURIComponent($('#o_wblog_post_name').html() || '');
            var articleURL = encodeURIComponent(window.location.href);
            if ($element.hasClass('o_twitter')) {
                var twitterText = core._t("Amazing blog article: %s! Check it live: %s");
                var tweetText = _.string.sprintf(twitterText, blogPostTitle, articleURL);
                url = 'https://twitter.com/intent/tweet?tw_p=tweetbutton&text=' + tweetText;
            } else if ($element.hasClass('o_facebook')) {
                url = 'https://www.facebook.com/sharer/sharer.php?u=' + articleURL;
            } else if ($element.hasClass('o_linkedin')) {
                url = 'https://www.linkedin.com/sharing/share-offsite/?url=' + articleURL;
            }
            window.open(url, '', 'menubar=no, width=500, height=400');
        },
        _forumScrollAction: function($el, duration, callback) {
            dom.scrollTo($el[0], {
                duration: duration
            }).then( () => callback());
        },
    });
});
;
/* /website_blog/static/src/snippets/s_latest_posts/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_blog.s_latest_posts_frontend', function(require) {
    'use strict';
    var core = require('web.core');
    var wUtils = require('website.utils');
    var publicWidget = require('web.public.widget');
    var _t = core._t;
    publicWidget.registry.js_get_posts = publicWidget.Widget.extend({
        selector: '.js_get_posts',
        disabledInEditableMode: false,
        start: function() {
            var self = this;
            const data = self.$target[0].dataset;
            const limit = parseInt(data.postsLimit) || 4;
            const blogID = parseInt(data.filterByBlogId);
            if (data.template && data.template.endsWith('.s_latest_posts_big_orizontal_template')) {
                data.template = 'website_blog.s_latest_posts_horizontal_template';
            }
            const template = data.template || 'website_blog.s_latest_posts_list_template';
            const loading = data.loading === 'true';
            const order = data.order || 'published_date desc';
            this.$target.empty();
            this.$target.attr('contenteditable', 'False');
            var domain = [];
            if (blogID) {
                domain.push(['blog_id', '=', blogID]);
            }
            if (order.includes('visits')) {
                domain.push(['visits', '!=', false]);
            }
            var prom = new Promise(function(resolve) {
                self._rpc({
                    route: '/blog/render_latest_posts',
                    params: {
                        template: template,
                        domain: domain,
                        limit: limit,
                        order: order,
                    },
                }).then(function(posts) {
                    var $posts = $(posts).filter('.s_latest_posts_post');
                    if (!$posts.length) {
                        self.$target.append($('<div/>', {
                            class: 'col-md-6 offset-md-3'
                        }).append($('<div/>', {
                            class: 'alert alert-warning alert-dismissible text-center',
                            text: _t("No blog post was found. Make sure your posts are published."),
                        })));
                        resolve();
                    }
                    if (loading) {
                        self._showLoading($posts);
                    } else {
                        self.$target.html($posts);
                    }
                    resolve();
                }).guardedCatch(function() {
                    if (self.editableMode) {
                        self.$target.append($('<p/>', {
                            class: 'text-danger',
                            text: _t("An error occured with this latest posts block. If the problem persists, please consider deleting it and adding a new one"),
                        }));
                    }
                    resolve();
                });
            }
            );
            return Promise.all([this._super.apply(this, arguments), prom]);
        },
        destroy: function() {
            this.$target.empty();
            this._super.apply(this, arguments);
        },
        _showLoading: function($posts) {
            var self = this;
            _.each($posts, function(post, i) {
                var $post = $(post);
                var $progress = $post.find('.s_latest_posts_loader');
                var bgUrl = $post.find('.o_record_cover_image').css('background-image').replace('url(', '').replace(')', '').replace(/\"/gi, "") || 'none';
                $post.appendTo(self.$target);
                if (bgUrl === 'none') {
                    $post.addClass('s_latest_posts_loader_no_cover');
                    $progress.remove();
                    return;
                }
                $progress.find('> div').removeClass('d-none').css('animation-delay', i * 200 + 'ms');
                var $dummyImg = $('<img/>', {
                    src: bgUrl
                });
                var timer = setTimeout(function() {
                    $post.find('.o_record_cover_image').addClass('bg-200');
                    $progress.remove();
                }, 10000);
                wUtils.onceAllImagesLoaded($dummyImg).then(function() {
                    $progress.fadeOut(500, function() {
                        $progress.removeClass('d-flex');
                    });
                    $dummyImg.remove();
                    clearTimeout(timer);
                });
            });
        },
    });
});
;
/* /sale/static/src/js/variant_mixin.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('sale.VariantMixin', function(require) {
    'use strict';
    var concurrency = require('web.concurrency');
    var core = require('web.core');
    var utils = require('web.utils');
    var ajax = require('web.ajax');
    var _t = core._t;
    var VariantMixin = {
        events: {
            'change .css_attribute_color input': '_onChangeColorAttribute',
            'change .main_product:not(.in_cart) input.js_quantity': 'onChangeAddQuantity',
            'change [data-attribute_exclusions]': 'onChangeVariant'
        },
        onChangeVariant: function(ev) {
            var $parent = $(ev.target).closest('.js_product');
            if (!$parent.data('uniqueId')) {
                $parent.data('uniqueId', _.uniqueId());
            }
            this._throttledGetCombinationInfo($parent.data('uniqueId'))(ev);
        },
        _getCombinationInfo: function(ev) {
            var self = this;
            if ($(ev.target).hasClass('variant_custom_value')) {
                return Promise.resolve();
            }
            var $parent = $(ev.target).closest('.js_product');
            var qty = $parent.find('input[name="add_qty"]').val();
            var combination = this.getSelectedVariantValues($parent);
            var parentCombination = $parent.find('ul[data-attribute_exclusions]').data('attribute_exclusions').parent_combination;
            var productTemplateId = parseInt($parent.find('.product_template_id').val());
            self._checkExclusions($parent, combination);
            return ajax.jsonRpc(this._getUri('/sale/get_combination_info'), 'call', {
                'product_template_id': productTemplateId,
                'product_id': this._getProductId($parent),
                'combination': combination,
                'add_qty': parseInt(qty),
                'pricelist_id': this.pricelistId || false,
                'parent_combination': parentCombination,
            }).then(function(combinationData) {
                self._onChangeCombination(ev, $parent, combinationData);
            });
        },
        handleCustomValues: function($target) {
            var $variantContainer;
            var $customInput = false;
            if ($target.is('input[type=radio]') && $target.is(':checked')) {
                $variantContainer = $target.closest('ul').closest('li');
                $customInput = $target;
            } else if ($target.is('select')) {
                $variantContainer = $target.closest('li');
                $customInput = $target.find('option[value="' + $target.val() + '"]');
            }
            if ($variantContainer) {
                if ($customInput && $customInput.data('is_custom') === 'True') {
                    var attributeValueId = $customInput.data('value_id');
                    var attributeValueName = $customInput.data('value_name');
                    if ($variantContainer.find('.variant_custom_value').length === 0 || $variantContainer.find('.variant_custom_value').data('custom_product_template_attribute_value_id') !== parseInt(attributeValueId)) {
                        $variantContainer.find('.variant_custom_value').remove();
                        var $input = $('<input>', {
                            type: 'text',
                            'data-custom_product_template_attribute_value_id': attributeValueId,
                            'data-attribute_value_name': attributeValueName,
                            class: 'variant_custom_value form-control'
                        });
                        var isRadioInput = $target.is('input[type=radio]') && $target.closest('label.css_attribute_color').length === 0;
                        if (isRadioInput && $customInput.data('is_single_and_custom') !== 'True') {
                            $input.addClass('custom_value_radio');
                            $target.closest('div').after($input);
                        } else {
                            $input.attr('placeholder', attributeValueName);
                            $input.addClass('custom_value_own_line');
                            $variantContainer.append($input);
                        }
                    }
                } else {
                    $variantContainer.find('.variant_custom_value').remove();
                }
            }
        },
        onClickAddCartJSON: function(ev) {
            ev.preventDefault();
            var $link = $(ev.currentTarget);
            var $input = $link.closest('.input-group').find("input");
            var min = parseFloat($input.data("min") || 0);
            var max = parseFloat($input.data("max") || Infinity);
            var previousQty = parseFloat($input.val() || 0, 10);
            var quantity = ($link.has(".fa-minus").length ? -1 : 1) + previousQty;
            var newQty = quantity > min ? (quantity < max ? quantity : max) : min;
            if (newQty !== previousQty) {
                $input.val(newQty).trigger('change');
            }
            return false;
        },
        onChangeAddQuantity: function(ev) {
            var $parent;
            if ($(ev.currentTarget).closest('.oe_optional_products_modal').length > 0) {
                $parent = $(ev.currentTarget).closest('.oe_optional_products_modal');
            } else if ($(ev.currentTarget).closest('form').length > 0) {
                $parent = $(ev.currentTarget).closest('form');
            } else {
                $parent = $(ev.currentTarget).closest('.o_product_configurator');
            }
            this.triggerVariantChange($parent);
        },
        triggerVariantChange: function($container) {
            var self = this;
            $container.find('ul[data-attribute_exclusions]').trigger('change');
            $container.find('input.js_variant_change:checked, select.js_variant_change').each(function() {
                self.handleCustomValues($(this));
            });
        },
        getCustomVariantValues: function($container) {
            var variantCustomValues = [];
            $container.find('.variant_custom_value').each(function() {
                var $variantCustomValueInput = $(this);
                if ($variantCustomValueInput.length !== 0) {
                    variantCustomValues.push({
                        'custom_product_template_attribute_value_id': $variantCustomValueInput.data('custom_product_template_attribute_value_id'),
                        'attribute_value_name': $variantCustomValueInput.data('attribute_value_name'),
                        'custom_value': $variantCustomValueInput.val(),
                    });
                }
            });
            return variantCustomValues;
        },
        getNoVariantAttributeValues: function($container) {
            var noVariantAttributeValues = [];
            var variantsValuesSelectors = ['input.no_variant.js_variant_change:checked', 'select.no_variant.js_variant_change'];
            $container.find(variantsValuesSelectors.join(',')).each(function() {
                var $variantValueInput = $(this);
                var singleNoCustom = $variantValueInput.data('is_single') && !$variantValueInput.data('is_custom');
                if ($variantValueInput.is('select')) {
                    $variantValueInput = $variantValueInput.find('option[value=' + $variantValueInput.val() + ']');
                }
                if ($variantValueInput.length !== 0 && !singleNoCustom) {
                    noVariantAttributeValues.push({
                        'custom_product_template_attribute_value_id': $variantValueInput.data('value_id'),
                        'attribute_value_name': $variantValueInput.data('value_name'),
                        'value': $variantValueInput.val(),
                        'attribute_name': $variantValueInput.data('attribute_name'),
                        'is_custom': $variantValueInput.data('is_custom')
                    });
                }
            });
            return noVariantAttributeValues;
        },
        getSelectedVariantValues: function($container) {
            var values = [];
            var unchangedValues = $container.find('div.oe_unchanged_value_ids').data('unchanged_value_ids') || [];
            var variantsValuesSelectors = ['input.js_variant_change:checked', 'select.js_variant_change'];
            _.each($container.find(variantsValuesSelectors.join(', ')), function(el) {
                values.push(+$(el).val());
            });
            return values.concat(unchangedValues);
        },
        selectOrCreateProduct: function($container, productId, productTemplateId, useAjax) {
            var self = this;
            productId = parseInt(productId);
            productTemplateId = parseInt(productTemplateId);
            var productReady = Promise.resolve();
            if (productId) {
                productReady = Promise.resolve(productId);
            } else {
                var params = {
                    product_template_id: productTemplateId,
                    product_template_attribute_value_ids: JSON.stringify(self.getSelectedVariantValues($container)),
                };
                var route = '/sale/create_product_variant';
                if (useAjax) {
                    productReady = ajax.jsonRpc(route, 'call', params);
                } else {
                    productReady = this._rpc({
                        route: route,
                        params: params
                    });
                }
            }
            return productReady;
        },
        _checkExclusions: function($parent, combination) {
            var self = this;
            var combinationData = $parent.find('ul[data-attribute_exclusions]').data('attribute_exclusions');
            $parent.find('option, input, label').removeClass('css_not_available').attr('title', function() {
                return $(this).data('value_name') || '';
            }).data('excluded-by', '');
            if (combinationData.exclusions) {
                _.each(combination, function(current_ptav) {
                    if (combinationData.exclusions.hasOwnProperty(current_ptav)) {
                        _.each(combinationData.exclusions[current_ptav], function(excluded_ptav) {
                            self._disableInput($parent, excluded_ptav, current_ptav, combinationData.mapped_attribute_names);
                        });
                    }
                });
            }
            _.each(combinationData.parent_exclusions, function(exclusions, excluded_by) {
                _.each(exclusions, function(ptav) {
                    self._disableInput($parent, ptav, excluded_by, combinationData.mapped_attribute_names, combinationData.parent_product_name);
                });
            });
        },
        _getProductId: function($parent) {
            return parseInt($parent.find('.product_id').val());
        },
        _disableInput: function($parent, attributeValueId, excludedBy, attributeNames, productName) {
            var $input = $parent.find('option[value=' + attributeValueId + '], input[value=' + attributeValueId + ']');
            $input.addClass('css_not_available');
            $input.closest('label').addClass('css_not_available');
            if (excludedBy && attributeNames) {
                var $target = $input.is('option') ? $input : $input.closest('label').add($input);
                var excludedByData = [];
                if ($target.data('excluded-by')) {
                    excludedByData = JSON.parse($target.data('excluded-by'));
                }
                var excludedByName = attributeNames[excludedBy];
                if (productName) {
                    excludedByName = productName + ' (' + excludedByName + ')';
                }
                excludedByData.push(excludedByName);
                $target.attr('title', _.str.sprintf(_t('Not available with %s'), excludedByData.join(', ')));
                $target.data('excluded-by', JSON.stringify(excludedByData));
            }
        },
        _onChangeCombination: function(ev, $parent, combination) {
            var self = this;
            var $price = $parent.find(".oe_price:first .oe_currency_value");
            var $default_price = $parent.find(".oe_default_price:first .oe_currency_value");
            var $optional_price = $parent.find(".oe_optional:first .oe_currency_value");
            $price.text(self._priceToStr(combination.price));
            $default_price.text(self._priceToStr(combination.list_price));
            var isCombinationPossible = true;
            if (!_.isUndefined(combination.is_combination_possible)) {
                isCombinationPossible = combination.is_combination_possible;
            }
            this._toggleDisable($parent, isCombinationPossible);
            if (combination.has_discounted_price) {
                $default_price.closest('.oe_website_sale').addClass("discount");
                $optional_price.closest('.oe_optional').removeClass('d-none').css('text-decoration', 'line-through');
                $default_price.parent().removeClass('d-none');
            } else {
                $default_price.closest('.oe_website_sale').removeClass("discount");
                $optional_price.closest('.oe_optional').addClass('d-none');
                $default_price.parent().addClass('d-none');
            }
            var rootComponentSelectors = ['tr.js_product', '.oe_website_sale', '.o_product_configurator'];
            if (!combination.product_id || !this.last_product_id || combination.product_id !== this.last_product_id) {
                this.last_product_id = combination.product_id;
                self._updateProductImage($parent.closest(rootComponentSelectors.join(', ')), combination.display_image, combination.product_id, combination.product_template_id, combination.carousel, isCombinationPossible);
            }
            $parent.find('.product_id').first().val(combination.product_id || 0).trigger('change');
            $parent.find('.product_display_name').first().text(combination.display_name);
            $parent.find('.js_raw_price').first().text(combination.price).trigger('change');
            this.handleCustomValues($(ev.target));
        },
        _priceToStr: function(price) {
            var l10n = _t.database.parameters;
            var precision = 2;
            if ($('.decimal_precision').length) {
                precision = parseInt($('.decimal_precision').last().data('precision'));
            }
            var formatted = _.str.sprintf('%.' + precision + 'f', price).split('.');
            formatted[0] = utils.insert_thousand_seps(formatted[0]);
            return formatted.join(l10n.decimal_point);
        },
        _throttledGetCombinationInfo: _.memoize(function(uniqueId) {
            var dropMisordered = new concurrency.DropMisordered();
            var _getCombinationInfo = _.throttle(this._getCombinationInfo.bind(this), 500);
            return function(ev, params) {
                return dropMisordered.add(_getCombinationInfo(ev, params));
            }
            ;
        }),
        _toggleDisable: function($parent, isCombinationPossible) {
            $parent.toggleClass('css_not_available', !isCombinationPossible);
        },
        _updateProductImage: function($productContainer, displayImage, productId, productTemplateId) {
            var model = productId ? 'product.product' : 'product.template';
            var modelId = productId || productTemplateId;
            var imageUrl = '/web/image/{0}/{1}/' + (this._productImageField ? this._productImageField : 'image_1024');
            var imageSrc = imageUrl.replace("{0}", model).replace("{1}", modelId);
            var imagesSelectors = ['span[data-oe-model^="product."][data-oe-type="image"] img:first', 'img.product_detail_img', 'span.variant_image img', 'img.variant_image', ];
            var $img = $productContainer.find(imagesSelectors.join(', '));
            if (displayImage) {
                $img.removeClass('invisible').attr('src', imageSrc);
            } else {
                $img.addClass('invisible');
            }
        },
        _onChangeColorAttribute: function(ev) {
            var $parent = $(ev.target).closest('.js_product');
            $parent.find('.css_attribute_color').removeClass("active").filter(':has(input:checked)').addClass("active");
        },
        _getUri: function(uri) {
            return uri;
        }
    };
    return VariantMixin;
});
;
/* /website_sale/static/src/js/variant_mixin.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.VariantMixin', function(require) {
    'use strict';
    var VariantMixin = require('sale.VariantMixin');
    VariantMixin._getUri = function(uri) {
        if (this.isWebsite) {
            return uri + '_website';
        } else {
            return uri;
        }
    }
    ;
    return VariantMixin;
});
;
/* /website_sale/static/src/js/website_sale.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.cart', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    var core = require('web.core');
    var _t = core._t;
    var timeout;
    publicWidget.registry.websiteSaleCartLink = publicWidget.Widget.extend({
        selector: '#top_menu a[href$="/shop/cart"]',
        events: {
            'mouseenter': '_onMouseEnter',
            'mouseleave': '_onMouseLeave',
            'click': '_onClick',
        },
        init: function() {
            this._super.apply(this, arguments);
            this._popoverRPC = null;
        },
        start: function() {
            this.$el.popover({
                trigger: 'manual',
                animation: true,
                html: true,
                title: function() {
                    return _t("My Cart");
                },
                container: 'body',
                placement: 'auto',
                template: '<div class="popover mycart-popover" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>'
            });
            return this._super.apply(this, arguments);
        },
        _onMouseEnter: function(ev) {
            var self = this;
            clearTimeout(timeout);
            $(this.selector).not(ev.currentTarget).popover('hide');
            timeout = setTimeout(function() {
                if (!self.$el.is(':hover') || $('.mycart-popover:visible').length) {
                    return;
                }
                self._popoverRPC = $.get("/shop/cart", {
                    type: 'popover',
                }).then(function(data) {
                    self.$el.data("bs.popover").config.content = data;
                    self.$el.popover("show");
                    $('.popover').on('mouseleave', function() {
                        self.$el.trigger('mouseleave');
                    });
                });
            }, 300);
        },
        _onMouseLeave: function(ev) {
            var self = this;
            setTimeout(function() {
                if ($('.popover:hover').length) {
                    return;
                }
                if (!self.$el.is(':hover')) {
                    self.$el.popover('hide');
                }
            }, 1000);
        },
        _onClick: function(ev) {
            clearTimeout(timeout);
            if (this._popoverRPC && this._popoverRPC.state() === 'pending') {
                ev.preventDefault();
                var href = ev.currentTarget.href;
                this._popoverRPC.then(function() {
                    window.location.href = href;
                });
            }
        },
    });
});
odoo.define('website_sale.website_sale_category', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    publicWidget.registry.websiteSaleCategory = publicWidget.Widget.extend({
        selector: '#o_shop_collapse_category',
        events: {
            'click .fa-chevron-right': '_onOpenClick',
            'click .fa-chevron-down': '_onCloseClick',
        },
        _onOpenClick: function(ev) {
            var $fa = $(ev.currentTarget);
            $fa.parent().siblings().find('.fa-chevron-down:first').click();
            $fa.parents('li').find('ul:first').show('normal');
            $fa.toggleClass('fa-chevron-down fa-chevron-right');
        },
        _onCloseClick: function(ev) {
            var $fa = $(ev.currentTarget);
            $fa.parent().find('ul:first').hide('normal');
            $fa.toggleClass('fa-chevron-down fa-chevron-right');
        },
    });
});
odoo.define('website_sale.website_sale', function(require) {
    'use strict';
    var core = require('web.core');
    var config = require('web.config');
    var publicWidget = require('web.public.widget');
    var VariantMixin = require('sale.VariantMixin');
    var wSaleUtils = require('website_sale.utils');
    const wUtils = require('website.utils');
    require("web.zoomodoo");
    publicWidget.registry.WebsiteSale = publicWidget.Widget.extend(VariantMixin, {
        selector: '.oe_website_sale',
        events: _.extend({}, VariantMixin.events || {}, {
            'change form .js_product:first input[name="add_qty"]': '_onChangeAddQuantity',
            'mouseup .js_publish': '_onMouseupPublish',
            'touchend .js_publish': '_onMouseupPublish',
            'change .oe_cart input.js_quantity[data-product-id]': '_onChangeCartQuantity',
            'click .oe_cart a.js_add_suggested_products': '_onClickSuggestedProduct',
            'click a.js_add_cart_json': '_onClickAddCartJSON',
            'click .a-submit': '_onClickSubmit',
            'change form.js_attributes input, form.js_attributes select': '_onChangeAttribute',
            'mouseup form.js_add_cart_json label': '_onMouseupAddCartLabel',
            'touchend form.js_add_cart_json label': '_onMouseupAddCartLabel',
            'click .show_coupon': '_onClickShowCoupon',
            'submit .o_wsale_products_searchbar_form': '_onSubmitSaleSearch',
            'change select[name="country_id"]': '_onChangeCountry',
            'change #shipping_use_same': '_onChangeShippingUseSame',
            'click .toggle_summary': '_onToggleSummary',
            'click #add_to_cart, #buy_now, #products_grid .o_wsale_product_btn .a-submit': 'async _onClickAdd',
            'click input.js_product_change': 'onChangeVariant',
            'change .js_main_product [data-attribute_exclusions]': 'onChangeVariant',
            'change oe_optional_products_modal [data-attribute_exclusions]': 'onChangeVariant',
        }),
        init: function() {
            this._super.apply(this, arguments);
            this._changeCartQuantity = _.debounce(this._changeCartQuantity.bind(this), 500);
            this._changeCountry = _.debounce(this._changeCountry.bind(this), 500);
            this.isWebsite = true;
            delete this.events['change .main_product:not(.in_cart) input.js_quantity'];
            delete this.events['change [data-attribute_exclusions]'];
        },
        start() {
            const def = this._super(...arguments);
            this._applyHashFromSearch();
            _.each(this.$('div.js_product'), function(product) {
                $('input.js_product_change', product).first().trigger('change');
            });
            this.triggerVariantChange(this.$el);
            this.$('select[name="country_id"]').change();
            core.bus.on('resize', this, function() {
                if (config.device.size_class === config.device.SIZES.XL) {
                    $('.toggle_summary_div').addClass('d-none d-xl-block');
                }
            });
            this._startZoom();
            window.addEventListener('hashchange', () => {
                this._applyHash();
                this.triggerVariantChange(this.$el);
            }
            );
            return def;
        },
        getSelectedVariantValues: function($container) {
            var combination = $container.find('input.js_product_change:checked').data('combination');
            if (combination) {
                return combination;
            }
            return VariantMixin.getSelectedVariantValues.apply(this, arguments);
        },
        _applyHash: function() {
            var hash = window.location.hash.substring(1);
            if (hash) {
                var params = $.deparam(hash);
                if (params['attr']) {
                    var attributeIds = params['attr'].split(',');
                    var $inputs = this.$('input.js_variant_change, select.js_variant_change option');
                    _.each(attributeIds, function(id) {
                        var $toSelect = $inputs.filter('[data-value_id="' + id + '"]');
                        if ($toSelect.is('input[type="radio"]')) {
                            $toSelect.prop('checked', true);
                        } else if ($toSelect.is('option')) {
                            $toSelect.prop('selected', true);
                        }
                    });
                    this._changeColorAttribute();
                }
            }
        },
        _setUrlHash: function($parent) {
            var $attributes = $parent.find('input.js_variant_change:checked, select.js_variant_change option:selected');
            var attributeIds = _.map($attributes, function(elem) {
                return $(elem).data('value_id');
            });
            history.replaceState(undefined, undefined, '#attr=' + attributeIds.join(','));
        },
        _changeColorAttribute: function() {
            $('.css_attribute_color').removeClass("active").filter(':has(input:checked)').addClass("active");
        },
        _changeCartQuantity: function($input, value, $dom_optional, line_id, productIDs) {
            _.each($dom_optional, function(elem) {
                $(elem).find('.js_quantity').text(value);
                productIDs.push($(elem).find('span[data-product-id]').data('product-id'));
            });
            $input.data('update_change', true);
            this._rpc({
                route: "/shop/cart/update_json",
                params: {
                    line_id: line_id,
                    product_id: parseInt($input.data('product-id'), 10),
                    set_qty: value
                },
            }).then(function(data) {
                $input.data('update_change', false);
                var check_value = parseInt($input.val() || 0, 10);
                if (isNaN(check_value)) {
                    check_value = 1;
                }
                if (value !== check_value) {
                    $input.trigger('change');
                    return;
                }
                if (!data.cart_quantity) {
                    return window.location = '/shop/cart';
                }
                wSaleUtils.updateCartNavBar(data);
                $input.val(data.quantity);
                $('.js_quantity[data-line-id=' + line_id + ']').val(data.quantity).html(data.quantity);
                if (data.warning) {
                    var cart_alert = $('.oe_cart').parent().find('#data_warning');
                    if (cart_alert.length === 0) {
                        $('.oe_cart').prepend('<div class="alert alert-danger alert-dismissable" role="alert" id="data_warning">' + '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button> ' + data.warning + '</div>');
                    } else {
                        cart_alert.html('<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button> ' + data.warning);
                    }
                    $input.val(data.quantity);
                }
            });
        },
        _changeCountry: function() {
            if (!$("#country_id").val()) {
                return;
            }
            this._rpc({
                route: "/shop/country_infos/" + $("#country_id").val(),
                params: {
                    mode: $("#country_id").attr('mode'),
                },
            }).then(function(data) {
                $("input[name='phone']").attr('placeholder', data.phone_code !== 0 ? '+' + data.phone_code : '');
                var selectStates = $("select[name='state_id']");
                if (selectStates.data('init') === 0 || selectStates.find('option').length === 1) {
                    if (data.states.length || data.state_required) {
                        selectStates.html('');
                        _.each(data.states, function(x) {
                            var opt = $('<option>').text(x[1]).attr('value', x[0]).attr('data-code', x[2]);
                            selectStates.append(opt);
                        });
                        selectStates.parent('div').show();
                    } else {
                        selectStates.val('').parent('div').hide();
                    }
                    selectStates.data('init', 0);
                } else {
                    selectStates.data('init', 0);
                }
                if (data.fields) {
                    if ($.inArray('zip', data.fields) > $.inArray('city', data.fields)) {
                        $(".div_zip").before($(".div_city"));
                    } else {
                        $(".div_zip").after($(".div_city"));
                    }
                    var all_fields = ["street", "zip", "city", "country_name"];
                    _.each(all_fields, function(field) {
                        $(".checkout_autoformat .div_" + field.split('_')[0]).toggle($.inArray(field, data.fields) >= 0);
                    });
                }
                if ($("label[for='zip']").length) {
                    $("label[for='zip']").toggleClass('label-optional', !data.zip_required);
                    $("label[for='zip']").get(0).toggleAttribute('required', !!data.zip_required);
                }
                if ($("label[for='zip']").length) {
                    $("label[for='state_id']").toggleClass('label-optional', !data.state_required);
                    $("label[for='state_id']").get(0).toggleAttribute('required', !!data.state_required);
                }
            });
        },
        _getProductId: function($parent) {
            if ($parent.find('input.js_product_change').length !== 0) {
                return parseInt($parent.find('input.js_product_change:checked').val());
            } else {
                return VariantMixin._getProductId.apply(this, arguments);
            }
        },
        _startZoom: function() {
            if (!config.device.isMobile) {
                var autoZoom = $('.ecom-zoomable').data('ecom-zoom-auto') || false
                  , attach = '#o-carousel-product';
                _.each($('.ecom-zoomable img[data-zoom]'), function(el) {
                    onImageLoaded(el, function() {
                        var $img = $(el);
                        $img.zoomOdoo({
                            event: autoZoom ? 'mouseenter' : 'click',
                            attach: attach
                        });
                        $img.attr('data-zoom', 1);
                    });
                });
            }
            function onImageLoaded(img, callback) {
                $(img).on('load', function() {
                    callback();
                });
                if (img.complete) {
                    callback();
                }
            }
        },
        _updateProductImage: function($productContainer, displayImage, productId, productTemplateId, newCarousel, isCombinationPossible) {
            var $carousel = $productContainer.find('#o-carousel-product');
            if (window.location.search.indexOf('enable_editor') === -1) {
                var $newCarousel = $(newCarousel);
                $carousel.after($newCarousel);
                $carousel.remove();
                $carousel = $newCarousel;
                $carousel.carousel(0);
                this._startZoom();
                this.trigger_up('widgets_start_request', {
                    $target: $carousel
                });
            }
            $carousel.toggleClass('css_not_available', !isCombinationPossible);
        },
        _onClickAdd: function(ev) {
            ev.preventDefault();
            var def = () => {
                this.isBuyNow = $(ev.currentTarget).attr('id') === 'buy_now';
                return this._handleAdd($(ev.currentTarget).closest('form'));
            }
            ;
            if ($('.js_add_cart_variants').children().length) {
                return this._getCombinationInfo(ev).then( () => {
                    return !$(ev.target).closest('.js_product').hasClass("css_not_available") ? def() : Promise.resolve();
                }
                );
            }
            return def();
        },
        _handleAdd: function($form) {
            var self = this;
            this.$form = $form;
            var productSelector = ['input[type="hidden"][name="product_id"]', 'input[type="radio"][name="product_id"]:checked'];
            var productReady = this.selectOrCreateProduct($form, parseInt($form.find(productSelector.join(', ')).first().val(), 10), $form.find('.product_template_id').val(), false);
            return productReady.then(function(productId) {
                $form.find(productSelector.join(', ')).val(productId);
                self.rootProduct = {
                    product_id: productId,
                    quantity: parseFloat($form.find('input[name="add_qty"]').val() || 1),
                    product_custom_attribute_values: self.getCustomVariantValues($form.find('.js_product')),
                    variant_values: self.getSelectedVariantValues($form.find('.js_product')),
                    no_variant_attribute_values: self.getNoVariantAttributeValues($form.find('.js_product'))
                };
                return self._onProductReady();
            });
        },
        _onProductReady: function() {
            return this._submitForm();
        },
        _submitForm: function() {
            let params = this.rootProduct;
            params.add_qty = params.quantity;
            params.product_custom_attribute_values = JSON.stringify(params.product_custom_attribute_values);
            params.no_variant_attribute_values = JSON.stringify(params.no_variant_attribute_values);
            if (this.isBuyNow) {
                params.express = true;
            }
            return wUtils.sendRequest('/shop/cart/update', params);
        },
        _onClickAddCartJSON: function(ev) {
            this.onClickAddCartJSON(ev);
        },
        _onChangeAddQuantity: function(ev) {
            this.onChangeAddQuantity(ev);
        },
        _onMouseupPublish: function(ev) {
            $(ev.currentTarget).parents('.thumbnail').toggleClass('disabled');
        },
        _onChangeCartQuantity: function(ev) {
            var $input = $(ev.currentTarget);
            if ($input.data('update_change')) {
                return;
            }
            var value = parseInt($input.val() || 0, 10);
            if (isNaN(value)) {
                value = 1;
            }
            var $dom = $input.closest('tr');
            var $dom_optional = $dom.nextUntil(':not(.optional_product.info)');
            var line_id = parseInt($input.data('line-id'), 10);
            var productIDs = [parseInt($input.data('product-id'), 10)];
            this._changeCartQuantity($input, value, $dom_optional, line_id, productIDs);
        },
        _onClickSuggestedProduct: function(ev) {
            $(ev.currentTarget).prev('input').val(1).trigger('change');
        },
        _onClickSubmit: function(ev, forceSubmit) {
            if ($(ev.currentTarget).is('#add_to_cart, #products_grid .a-submit') && !forceSubmit) {
                return;
            }
            var $aSubmit = $(ev.currentTarget);
            if (!ev.isDefaultPrevented() && !$aSubmit.is(".disabled")) {
                ev.preventDefault();
                $aSubmit.closest('form').submit();
            }
            if ($aSubmit.hasClass('a-submit-disable')) {
                $aSubmit.addClass("disabled");
            }
            if ($aSubmit.hasClass('a-submit-loading')) {
                var loading = '<span class="fa fa-cog fa-spin"/>';
                var fa_span = $aSubmit.find('span[class*="fa"]');
                if (fa_span.length) {
                    fa_span.replaceWith(loading);
                } else {
                    $aSubmit.append(loading);
                }
            }
        },
        _onChangeAttribute: function(ev) {
            if (!ev.isDefaultPrevented()) {
                ev.preventDefault();
                $(ev.currentTarget).closest("form").submit();
            }
        },
        _onMouseupAddCartLabel: function(ev) {
            var $label = $(ev.currentTarget);
            var $price = $label.parents("form:first").find(".oe_price .oe_currency_value");
            if (!$price.data("price")) {
                $price.data("price", parseFloat($price.text()));
            }
            var value = $price.data("price") + parseFloat($label.find(".badge span").text() || 0);
            var dec = value % 1;
            $price.html(value + (dec < 0.01 ? ".00" : (dec < 1 ? "0" : "")));
        },
        _onClickShowCoupon: function(ev) {
            $(ev.currentTarget).hide();
            $('.coupon_form').removeClass('d-none');
        },
        _onSubmitSaleSearch: function(ev) {
            if (!this.$('.dropdown_sorty_by').length) {
                return;
            }
            var $this = $(ev.currentTarget);
            if (!ev.isDefaultPrevented() && !$this.is(".disabled")) {
                ev.preventDefault();
                var oldurl = $this.attr('action');
                oldurl += (oldurl.indexOf("?") === -1) ? "?" : "";
                var search = $this.find('input.search-query');
                window.location = oldurl + '&' + search.attr('name') + '=' + encodeURIComponent(search.val());
            }
        },
        _onChangeCountry: function(ev) {
            if (!this.$('.checkout_autoformat').length) {
                return;
            }
            this._changeCountry();
        },
        _onChangeShippingUseSame: function(ev) {
            $('.ship_to_other').toggle(!$(ev.currentTarget).prop('checked'));
        },
        _toggleDisable: function($parent, isCombinationPossible) {
            VariantMixin._toggleDisable.apply(this, arguments);
            $parent.find("#add_to_cart").toggleClass('disabled', !isCombinationPossible);
            $parent.find("#buy_now").toggleClass('disabled', !isCombinationPossible);
        },
        onChangeVariant: function(ev) {
            var $component = $(ev.currentTarget).closest('.js_product');
            $component.find('input').each(function() {
                var $el = $(this);
                $el.attr('checked', $el.is(':checked'));
            });
            $component.find('select option').each(function() {
                var $el = $(this);
                $el.attr('selected', $el.is(':selected'));
            });
            this._setUrlHash($component);
            return VariantMixin.onChangeVariant.apply(this, arguments);
        },
        _onToggleSummary: function() {
            $('.toggle_summary_div').toggleClass('d-none');
            $('.toggle_summary_div').removeClass('d-xl-block');
        },
        _applyHashFromSearch() {
            const params = $.deparam(window.location.search.slice(1));
            if (params.attrib) {
                const dataValueIds = [];
                for (const attrib of [].concat(params.attrib)) {
                    const attribSplit = attrib.split('-');
                    const attribValueSelector = `.js_variant_change[name="ptal-${attribSplit[0]}"][value="${attribSplit[1]}"]`;
                    const attribValue = this.el.querySelector(attribValueSelector);
                    if (attribValue !== null) {
                        dataValueIds.push(attribValue.dataset.value_id);
                    }
                }
                if (dataValueIds.length) {
                    history.replaceState(undefined, undefined, `#attr=${dataValueIds.join(',')}`);
                }
            }
            this._applyHash();
        },
    });
    publicWidget.registry.WebsiteSaleLayout = publicWidget.Widget.extend({
        selector: '.oe_website_sale',
        disabledInEditableMode: false,
        events: {
            'change .o_wsale_apply_layout': '_onApplyShopLayoutChange',
        },
        _onApplyShopLayoutChange: function(ev) {
            var switchToList = $(ev.currentTarget).find('.o_wsale_apply_list input').is(':checked');
            if (!this.editableMode) {
                this._rpc({
                    route: '/shop/save_shop_layout_mode',
                    params: {
                        'layout_mode': switchToList ? 'list' : 'grid',
                    },
                });
            }
            var $grid = this.$('#products_grid');
            $grid.find('*').css('transition', 'none');
            $grid.toggleClass('o_wsale_layout_list', switchToList);
            void $grid[0].offsetWidth;
            $grid.find('*').css('transition', '');
        },
    });
    publicWidget.registry.websiteSaleCart = publicWidget.Widget.extend({
        selector: '.oe_website_sale .oe_cart',
        events: {
            'click .js_change_shipping': '_onClickChangeShipping',
            'click .js_edit_address': '_onClickEditAddress',
            'click .js_delete_product': '_onClickDeleteProduct',
        },
        _onClickChangeShipping: function(ev) {
            var $old = $('.all_shipping').find('.card.border.border-primary');
            $old.find('.btn-ship').toggle();
            $old.addClass('js_change_shipping');
            $old.removeClass('border border-primary');
            var $new = $(ev.currentTarget).parent('div.one_kanban').find('.card');
            $new.find('.btn-ship').toggle();
            $new.removeClass('js_change_shipping');
            $new.addClass('border border-primary');
            var $form = $(ev.currentTarget).parent('div.one_kanban').find('form.d-none');
            $.post($form.attr('action'), $form.serialize() + '&xhr=1');
        },
        _onClickEditAddress: function(ev) {
            ev.preventDefault();
            $(ev.currentTarget).closest('div.one_kanban').find('form.d-none').attr('action', '/shop/address').submit();
        },
        _onClickDeleteProduct: function(ev) {
            ev.preventDefault();
            $(ev.currentTarget).closest('tr').find('.js_quantity').val(0).trigger('change');
        },
    });
});
;
/* /website_sale/static/src/js/website_sale_utils.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.utils', function(require) {
    'use strict';
    function animateClone($cart, $elem, offsetTop, offsetLeft) {
        if (!$cart.length) {
            return Promise.resolve();
        }
        $cart.find('.o_animate_blink').addClass('o_red_highlight o_shadow_animation').delay(500).queue(function() {
            $(this).removeClass("o_shadow_animation").dequeue();
        }).delay(2000).queue(function() {
            $(this).removeClass("o_red_highlight").dequeue();
        });
        return new Promise(function(resolve, reject) {
            var $imgtodrag = $elem.find('img').eq(0);
            if ($imgtodrag.length) {
                var $imgclone = $imgtodrag.clone().offset({
                    top: $imgtodrag.offset().top,
                    left: $imgtodrag.offset().left
                }).addClass('o_website_sale_animate').appendTo(document.body).animate({
                    top: $cart.offset().top + offsetTop,
                    left: $cart.offset().left + offsetLeft,
                    width: 75,
                    height: 75,
                }, 1000, 'easeInOutExpo');
                $imgclone.animate({
                    width: 0,
                    height: 0,
                }, function() {
                    resolve();
                    $(this).detach();
                });
            } else {
                resolve();
            }
        }
        );
    }
    function updateCartNavBar(data) {
        var $qtyNavBar = $(".my_cart_quantity");
        _.each($qtyNavBar, function(qty) {
            var $qty = $(qty);
            $qty.parents('li:first').removeClass('d-none');
            $qty.html(data.cart_quantity).hide().fadeIn(600);
        });
        $(".js_cart_lines").first().before(data['website_sale.cart_lines']).end().remove();
        $(".js_cart_summary").first().before(data['website_sale.short_cart_summary']).end().remove();
    }
    return {
        animateClone: animateClone,
        updateCartNavBar: updateCartNavBar,
    };
});
;
/* /website_sale/static/src/js/website_sale_payment.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.payment', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    publicWidget.registry.WebsiteSalePayment = publicWidget.Widget.extend({
        selector: '#wrapwrap:has(#checkbox_cgv)',
        events: {
            'change #checkbox_cgv': '_onCGVCheckboxClick',
        },
        start: function() {
            this.$checkbox = this.$('#checkbox_cgv');
            this.$payButton = $('button#o_payment_form_pay');
            this.$checkbox.trigger('change');
            return this._super.apply(this, arguments);
        },
        _adaptPayButton: function() {
            var disabledReasons = this.$payButton.data('disabled_reasons') || {};
            disabledReasons.cgv = !this.$checkbox.prop('checked');
            this.$payButton.data('disabled_reasons', disabledReasons);
            this.$payButton.prop('disabled', _.contains(disabledReasons, true));
        },
        _onCGVCheckboxClick: function() {
            this._adaptPayButton();
        },
    });
});
;
/* /website_sale/static/src/js/website_sale_validate.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.validate', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    var core = require('web.core');
    var _t = core._t;
    publicWidget.registry.websiteSaleValidate = publicWidget.Widget.extend({
        selector: 'div.oe_website_sale_tx_status[data-order-id]',
        start: function() {
            var def = this._super.apply(this, arguments);
            this._poll_nbr = 0;
            this._paymentTransationPollStatus();
            return def;
        },
        _paymentTransationPollStatus: function() {
            var self = this;
            this._rpc({
                route: '/shop/payment/get_status/' + parseInt(this.$el.data('order-id')),
            }).then(function(result) {
                self._poll_nbr += 1;
                if (result.recall) {
                    if (self._poll_nbr < 20) {
                        setTimeout(function() {
                            self._paymentTransationPollStatus();
                        }, Math.ceil(self._poll_nbr / 3) * 1000);
                    } else {
                        var $message = $(result.message);
                        var $warning = $("<i class='fa fa-warning' style='margin-right:10px;'>");
                        $warning.attr("title", _t("We are waiting for confirmation from the bank or the payment provider"));
                        $message.find('span:first').prepend($warning);
                        result.message = $message.html();
                    }
                }
                self.$el.html(result.message);
            });
        },
    });
});
;
/* /website_sale/static/src/js/website_sale_recently_viewed.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.recently_viewed', function(require) {
    var concurrency = require('web.concurrency');
    var config = require('web.config');
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var utils = require('web.utils');
    var wSaleUtils = require('website_sale.utils');
    var qweb = core.qweb;
    publicWidget.registry.productsRecentlyViewedSnippet = publicWidget.Widget.extend({
        selector: '.s_wsale_products_recently_viewed',
        xmlDependencies: ['/website_sale/static/src/xml/website_sale_recently_viewed.xml'],
        disabledInEditableMode: false,
        read_events: {
            'click .js_add_cart': '_onAddToCart',
            'click .js_remove': '_onRemove',
        },
        init: function() {
            this._super.apply(this, arguments);
            this._dp = new concurrency.DropPrevious();
            this.uniqueId = _.uniqueId('o_carousel_recently_viewed_products_');
            this._onResizeChange = _.debounce(this._addCarousel, 100);
        },
        start: function() {
            this._dp.add(this._fetch()).then(this._render.bind(this));
            $(window).resize( () => {
                this._onResizeChange();
            }
            );
            return this._super.apply(this, arguments);
        },
        destroy: function() {
            this._super(...arguments);
            this.$el.addClass('d-none');
            this.$el.find('.slider').html('');
        },
        _fetch: function() {
            return this._rpc({
                route: '/shop/products/recently_viewed',
            }).then(res => {
                var products = res['products'];
                if (this.editableMode && (!products || !products.length)) {
                    return {
                        'products': [{
                            id: 0,
                            website_url: '#',
                            display_name: 'Product 1',
                            price: '$ <span class="oe_currency_value">750.00</span>',
                        }, {
                            id: 0,
                            website_url: '#',
                            display_name: 'Product 2',
                            price: '$ <span class="oe_currency_value">750.00</span>',
                        }, {
                            id: 0,
                            website_url: '#',
                            display_name: 'Product 3',
                            price: '$ <span class="oe_currency_value">750.00</span>',
                        }, {
                            id: 0,
                            website_url: '#',
                            display_name: 'Product 4',
                            price: '$ <span class="oe_currency_value">750.00</span>',
                        }],
                    };
                }
                return res;
            }
            );
        },
        _render: function(res) {
            var products = res['products'];
            var mobileProducts = []
              , webProducts = []
              , productsTemp = [];
            _.each(products, function(product) {
                if (productsTemp.length === 4) {
                    webProducts.push(productsTemp);
                    productsTemp = [];
                }
                productsTemp.push(product);
                mobileProducts.push([product]);
            });
            if (productsTemp.length) {
                webProducts.push(productsTemp);
            }
            this.mobileCarousel = $(qweb.render('website_sale.productsRecentlyViewed', {
                uniqueId: this.uniqueId,
                productFrame: 1,
                productsGroups: mobileProducts,
            }));
            this.webCarousel = $(qweb.render('website_sale.productsRecentlyViewed', {
                uniqueId: this.uniqueId,
                productFrame: 4,
                productsGroups: webProducts,
            }));
            this._addCarousel();
            this.$el.toggleClass('d-none', !(products && products.length));
        },
        _addCarousel: function() {
            var carousel = config.device.size_class <= config.device.SIZES.SM ? this.mobileCarousel : this.webCarousel;
            this.$('.slider').html(carousel).css('display', '');
        },
        _onAddToCart: function(ev) {
            var self = this;
            var $card = $(ev.currentTarget).closest('.card');
            this._rpc({
                route: "/shop/cart/update_json",
                params: {
                    product_id: $card.find('input[data-product-id]').data('product-id'),
                    add_qty: 1
                },
            }).then(function(data) {
                wSaleUtils.updateCartNavBar(data);
                var $navButton = $('header .o_wsale_my_cart').first();
                var fetch = self._fetch();
                var animation = wSaleUtils.animateClone($navButton, $(ev.currentTarget).parents('.o_carousel_product_card'), 25, 40);
                Promise.all([fetch, animation]).then(function(values) {
                    self._render(values[0]);
                });
            });
        },
        _onRemove: function(ev) {
            var self = this;
            var $card = $(ev.currentTarget).closest('.card');
            this._rpc({
                route: "/shop/products/recently_viewed_delete",
                params: {
                    product_id: $card.find('input[data-product-id]').data('product-id'),
                },
            }).then(function(data) {
                self._render(data);
            });
        },
    });
    publicWidget.registry.productsRecentlyViewedUpdate = publicWidget.Widget.extend({
        selector: '#product_detail',
        events: {
            'change input.product_id[name="product_id"]': '_onProductChange',
        },
        debounceValue: 8000,
        init: function() {
            this._super.apply(this, arguments);
            this._onProductChange = _.debounce(this._onProductChange, this.debounceValue);
        },
        _updateProductView: function($input) {
            var productId = parseInt($input.val());
            var cookieName = 'seen_product_id_' + productId;
            if (!parseInt(this.el.dataset.viewTrack, 10)) {
                return;
            }
            if (utils.get_cookie(cookieName)) {
                return;
            }
            if ($(this.el).find('.js_product.css_not_available').length) {
                return;
            }
            this._rpc({
                route: '/shop/products/recently_viewed_update',
                params: {
                    product_id: productId,
                }
            }).then(function(res) {
                if (res && res.visitor_uuid) {
                    utils.set_cookie('visitor_uuid', res.visitor_uuid);
                }
                utils.set_cookie(cookieName, productId, 30 * 60);
            });
        },
        _onProductChange: function(ev) {
            this._updateProductView($(ev.currentTarget));
        },
    });
});
;
/* /website_sale/static/src/js/website_sale_tracking.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.tracking', function(require) {
    var publicWidget = require('web.public.widget');
    publicWidget.registry.websiteSaleTracking = publicWidget.Widget.extend({
        selector: '.oe_website_sale',
        events: {
            'click form[action="/shop/cart/update"] a.a-submit': '_onAddProductIntoCart',
            'click a[href="/shop/checkout"]': '_onCheckoutStart',
            'click div.oe_cart a[href^="/web?redirect"][href$="/shop/checkout"]': '_onCustomerSignin',
            'click form[action="/shop/confirm_order"] a.a-submit': '_onOrder',
            'click form[target="_self"] button[type=submit]': '_onOrderPayment',
        },
        start: function() {
            var self = this;
            if (this.$el.is('#product_detail')) {
                var productID = this.$('input[name="product_id"]').attr('value');
                this._vpv('/stats/ecom/product_view/' + productID);
            }
            if (this.$('div.oe_website_sale_tx_status').length) {
                this._trackGA('require', 'ecommerce');
                var orderID = this.$('div.oe_website_sale_tx_status').data('order-id');
                this._vpv('/stats/ecom/order_confirmed/' + orderID);
                this._rpc({
                    route: '/shop/tracking_last_order/',
                }).then(function(o) {
                    self._trackGA('ecommerce:clear');
                    if (o.transaction && o.lines) {
                        self._trackGA('ecommerce:addTransaction', o.transaction);
                        _.forEach(o.lines, function(line) {
                            self._trackGA('ecommerce:addItem', line);
                        });
                    }
                    self._trackGA('ecommerce:send');
                });
            }
            return this._super.apply(this, arguments);
        },
        _trackGA: function() {
            var websiteGA = window.ga || function() {}
            ;
            websiteGA.apply(this, arguments);
        },
        _vpv: function(page) {
            this._trackGA('send', 'pageview', {
                'page': page,
                'title': document.title,
            });
        },
        _onAddProductIntoCart: function() {
            var productID = this.$('input[name="product_id"]').attr('value');
            this._vpv('/stats/ecom/product_add_to_cart/' + productID);
        },
        _onCheckoutStart: function() {
            this._vpv('/stats/ecom/customer_checkout');
        },
        _onCustomerSignin: function() {
            this._vpv('/stats/ecom/customer_signin');
        },
        _onOrder: function() {
            if ($('#top_menu [href="/web/login"]').length) {
                this._vpv('/stats/ecom/customer_signup');
            }
            this._vpv('/stats/ecom/order_checkout');
        },
        _onOrderPayment: function() {
            var method = $('#payment_method input[name=acquirer]:checked').nextAll('span:first').text();
            this._vpv('/stats/ecom/order_payment/' + method);
        },
    });
});
;
/* /website_sale/static/src/snippets/s_products_searchbar/000.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale.s_products_searchbar', function(require) {
    'use strict';
    const concurrency = require('web.concurrency');
    const publicWidget = require('web.public.widget');
    const {qweb} = require('web.core');
    publicWidget.registry.productsSearchBar = publicWidget.Widget.extend({
        selector: '.o_wsale_products_searchbar_form',
        xmlDependencies: ['/website_sale/static/src/xml/website_sale_utils.xml'],
        events: {
            'input .search-query': '_onInput',
            'focusout': '_onFocusOut',
            'keydown .search-query': '_onKeydown',
        },
        autocompleteMinWidth: 300,
        init: function() {
            this._super.apply(this, arguments);
            this._dp = new concurrency.DropPrevious();
            this._onInput = _.debounce(this._onInput, 400);
            this._onFocusOut = _.debounce(this._onFocusOut, 100);
        },
        start: function() {
            this.$input = this.$('.search-query');
            this.order = this.$('.o_wsale_search_order_by').val();
            this.limit = parseInt(this.$input.data('limit'));
            this.displayDescription = !!this.$input.data('displayDescription');
            this.displayPrice = !!this.$input.data('displayPrice');
            this.displayImage = !!this.$input.data('displayImage');
            if (this.limit) {
                this.$input.attr('autocomplete', 'off');
            }
            return this._super.apply(this, arguments);
        },
        _fetch: function() {
            return this._rpc({
                route: '/shop/products/autocomplete',
                params: {
                    'term': this.$input.val(),
                    'options': {
                        'order': this.order,
                        'limit': this.limit,
                        'display_description': this.displayDescription,
                        'display_price': this.displayPrice,
                        'max_nb_chars': Math.round(Math.max(this.autocompleteMinWidth, parseInt(this.$el.width())) * 0.22),
                    },
                },
            });
        },
        _render: function(res) {
            var $prevMenu = this.$menu;
            this.$el.toggleClass('dropdown show', !!res);
            if (res) {
                var products = res['products'];
                this.$menu = $(qweb.render('website_sale.productsSearchBar.autocomplete', {
                    products: products,
                    hasMoreProducts: products.length < res['products_count'],
                    currency: res['currency'],
                    widget: this,
                }));
                this.$menu.css('min-width', this.autocompleteMinWidth);
                this.$el.append(this.$menu);
            }
            if ($prevMenu) {
                $prevMenu.remove();
            }
        },
        _onInput: function() {
            if (!this.limit) {
                return;
            }
            this._dp.add(this._fetch()).then(this._render.bind(this));
        },
        _onFocusOut: function() {
            if (!this.$el.has(document.activeElement).length) {
                this._render();
            }
        },
        _onKeydown: function(ev) {
            switch (ev.which) {
            case $.ui.keyCode.ESCAPE:
                this._render();
                break;
            case $.ui.keyCode.UP:
            case $.ui.keyCode.DOWN:
                ev.preventDefault();
                if (this.$menu) {
                    let $element = ev.which === $.ui.keyCode.UP ? this.$menu.children().last() : this.$menu.children().first();
                    $element.focus();
                }
                break;
            }
        },
    });
});
;
/* /website_sale_stock/static/src/js/variant_mixin.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale_stock.VariantMixin', function(require) {
    'use strict';
    var VariantMixin = require('sale.VariantMixin');
    var publicWidget = require('web.public.widget');
    var ajax = require('web.ajax');
    var core = require('web.core');
    var QWeb = core.qweb;
    var xml_load = ajax.loadXML('/website_sale_stock/static/src/xml/website_sale_stock_product_availability.xml', QWeb);
    VariantMixin._onChangeCombinationStock = function(ev, $parent, combination) {
        var product_id = 0;
        if ($parent.find('input.product_id:checked').length) {
            product_id = $parent.find('input.product_id:checked').val();
        } else {
            product_id = $parent.find('.product_id').val();
        }
        var isMainProduct = combination.product_id && ($parent.is('.js_main_product') || $parent.is('.main_product')) && combination.product_id === parseInt(product_id);
        if (!this.isWebsite || !isMainProduct) {
            return;
        }
        var qty = $parent.find('input[name="add_qty"]').val();
        $parent.find('#add_to_cart').removeClass('out_of_stock');
        $parent.find('#buy_now').removeClass('out_of_stock');
        if (combination.product_type === 'product' && _.contains(['always', 'threshold'], combination.inventory_availability)) {
            combination.virtual_available -= parseInt(combination.cart_qty);
            if (combination.virtual_available < 0) {
                combination.virtual_available = 0;
            }
            if (qty > combination.virtual_available) {
                var $input_add_qty = $parent.find('input[name="add_qty"]');
                qty = combination.virtual_available || 1;
                $input_add_qty.val(qty);
            }
            if (qty > combination.virtual_available || combination.virtual_available < 1 || qty < 1) {
                $parent.find('#add_to_cart').addClass('disabled out_of_stock');
                $parent.find('#buy_now').addClass('disabled out_of_stock');
            }
        }
        xml_load.then(function() {
            $('.oe_website_sale').find('.availability_message_' + combination.product_template).remove();
            var $message = $(QWeb.render('website_sale_stock.product_availability', combination));
            $('div.availability_messages').html($message);
        });
    }
    ;
    publicWidget.registry.WebsiteSale.include({
        _onChangeCombination: function() {
            this._super.apply(this, arguments);
            VariantMixin._onChangeCombinationStock.apply(this, arguments);
        }
    });
    return VariantMixin;
});
;
/* /website_sale_delivery/static/src/js/website_sale_delivery.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_sale_delivery.checkout', function(require) {
    'use strict';
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var _t = core._t;
    var concurrency = require('web.concurrency');
    var dp = new concurrency.DropPrevious();
    publicWidget.registry.websiteSaleDelivery = publicWidget.Widget.extend({
        selector: '.oe_website_sale',
        events: {
            'change select[name="shipping_id"]': '_onSetAddress',
            'click #delivery_carrier .o_delivery_carrier_select': '_onCarrierClick',
        },
        start: function() {
            var self = this;
            var $carriers = $('#delivery_carrier input[name="delivery_type"]');
            var $payButton = $('#o_payment_form_pay');
            if ($carriers.length > 0) {
                if ($carriers.filter(':checked').length === 0) {
                    $payButton.prop('disabled', true);
                    var disabledReasons = $payButton.data('disabled_reasons') || {};
                    disabledReasons.carrier_selection = true;
                    $payButton.data('disabled_reasons', disabledReasons);
                }
                $carriers.filter(':checked').click();
            }
            _.each($carriers, function(carrierInput, k) {
                self._showLoading($(carrierInput));
                self._rpc({
                    route: '/shop/carrier_rate_shipment',
                    params: {
                        'carrier_id': carrierInput.value,
                    },
                }).then(self._handleCarrierUpdateResultBadge.bind(self));
            });
            return this._super.apply(this, arguments);
        },
        _showLoading: function($carrierInput) {
            $carrierInput.siblings('.o_wsale_delivery_badge_price').html('<span class="fa fa-spinner fa-spin"/>');
        },
        _handleCarrierUpdateResult: function(result) {
            this._handleCarrierUpdateResultBadge(result);
            var $payButton = $('#o_payment_form_pay');
            var $amountDelivery = $('#order_delivery .monetary_field');
            var $amountUntaxed = $('#order_total_untaxed .monetary_field');
            var $amountTax = $('#order_total_taxes .monetary_field');
            var $amountTotal = $('#order_total .monetary_field, #amount_total_summary.monetary_field');
            if (result.status === true) {
                $amountDelivery.html(result.new_amount_delivery);
                $amountUntaxed.html(result.new_amount_untaxed);
                $amountTax.html(result.new_amount_tax);
                $amountTotal.html(result.new_amount_total);
                var disabledReasons = $payButton.data('disabled_reasons') || {};
                disabledReasons.carrier_selection = false;
                $payButton.data('disabled_reasons', disabledReasons);
                $payButton.prop('disabled', _.contains($payButton.data('disabled_reasons'), true));
            } else {
                $amountDelivery.html(result.new_amount_delivery);
                $amountUntaxed.html(result.new_amount_untaxed);
                $amountTax.html(result.new_amount_tax);
                $amountTotal.html(result.new_amount_total);
            }
        },
        _handleCarrierUpdateResultBadge: function(result) {
            var $carrierBadge = $('#delivery_carrier input[name="delivery_type"][value=' + result.carrier_id + '] ~ .o_wsale_delivery_badge_price');
            if (result.status === true) {
                if (result.is_free_delivery) {
                    $carrierBadge.text(_t('Free'));
                } else {
                    $carrierBadge.html(result.new_amount_delivery);
                }
                $carrierBadge.removeClass('o_wsale_delivery_carrier_error');
            } else {
                $carrierBadge.addClass('o_wsale_delivery_carrier_error');
                $carrierBadge.text(result.error_message);
            }
        },
        _onCarrierClick: function(ev) {
            var $radio = $(ev.currentTarget).find('input[type="radio"]');
            this._showLoading($radio);
            $radio.prop("checked", true);
            var $payButton = $('#o_payment_form_pay');
            $payButton.prop('disabled', true);
            var disabledReasons = $payButton.data('disabled_reasons') || {};
            disabledReasons.carrier_selection = true;
            $payButton.data('disabled_reasons', disabledReasons);
            dp.add(this._rpc({
                route: '/shop/update_carrier',
                params: {
                    carrier_id: $radio.val(),
                },
            })).then(this._handleCarrierUpdateResult.bind(this));
        },
        _onSetAddress: function(ev) {
            var value = $(ev.currentTarget).val();
            var $providerFree = $('select[name="country_id"]:not(.o_provider_restricted), select[name="state_id"]:not(.o_provider_restricted)');
            var $providerRestricted = $('select[name="country_id"].o_provider_restricted, select[name="state_id"].o_provider_restricted');
            if (value === 0) {
                $providerFree.hide().attr('disabled', true);
                $providerRestricted.show().attr('disabled', false).change();
            } else {
                $providerFree.show().attr('disabled', false).change();
                $providerRestricted.hide().attr('disabled', true);
            }
        },
    });
});
;
/* /website_animate/static/src/js/o_animate.frontend.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_animate.o_animate_frontend', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    var WebsiteAnimate = {
        win: {},
        items: {},
        offsetRatio: 0.3,
        offsetMin: 10,
        start: function() {
            var self = this;
            self.$scrollingElement = $().getScrollingElement();
            self.items = $("#wrapwrap .o_animate");
            const couldOverflowBecauseOfSafariBug = [...this.items].some(el => {
                return window.getComputedStyle(el).transform !== 'none';
            }
            );
            self.forceOverflowXHidden = false;
            if (couldOverflowBecauseOfSafariBug) {
                self._toggleOverflowXHidden(true);
                self.forceOverflowXHidden = true;
            }
            self.items.each(function() {
                var $el = $(this);
                if ($el[0].closest('.dropdown')) {
                    $el[0].classList.add('o_animate_in_dropdown');
                    return;
                }
                self.reset_animation($el);
            });
            setTimeout(function() {
                self.attach_handlers();
            });
        },
        attach_handlers: function() {
            var self = this;
            var lastScroll = 0;
            $(window).on("resize.o_animate", function() {
                self.win.h = $(window).height();
                $(window).trigger("scroll");
            }).trigger("resize");
            self.$scrollingElement.on("scroll.o_animate, slid.bs.carousel", (_.throttle(function() {
                var windowTop = $(window).scrollTop();
                var windowBottom = windowTop + self.win.h;
                var direction = (windowTop < lastScroll) ? -1 : 1;
                lastScroll = windowTop;
                $("#wrapwrap .o_animate:not(.o_animate_in_dropdown)").each(function() {
                    var $el = $(this);
                    var elHeight = $el.height();
                    var elOffset = direction * Math.max((elHeight * self.offsetRatio), self.offsetMin);
                    var state = $el.css("animation-play-state");
                    var elTop = self.getElementOffsetTop($el[0]) - $().getScrollingElement().scrollTop();
                    var visible = windowBottom > (elTop + elOffset) && windowTop < (elTop + elHeight - elOffset);
                    if (visible && (state === "paused")) {
                        $el.addClass("o_visible");
                        self.start_animation($el);
                    } else if (!(visible) && $el.hasClass("o_animate_both_scroll") && (state === "running")) {
                        $el.removeClass("o_visible");
                        self.reset_animation($el);
                    }
                });
            }, 100))).trigger("scroll");
        },
        reset_animation: function($el) {
            var self = this;
            var anim_name = $el.css("animation-name");
            $el.css({
                "animation-name": "dummy-none",
                "animation-play-state": ""
            }).removeClass("o_animated o_animating");
            self._toggleOverflowXHidden(false);
            setTimeout(function() {
                $el.css({
                    "animation-name": anim_name,
                    "animation-play-state": "paused"
                });
            }, 0);
        },
        start_animation: function($el) {
            var self = this;
            setTimeout(function() {
                self._toggleOverflowXHidden(true);
                $el.css({
                    "animation-play-state": "running"
                }).addClass("o_animating").one('webkitAnimationEnd oanimationend msAnimationEnd animationend', function(e) {
                    $el.addClass("o_animated").removeClass("o_animating");
                    self._toggleOverflowXHidden(false);
                    $(window).trigger("resize");
                });
            });
        },
        _toggleOverflowXHidden: function(add) {
            if (this.forceOverflowXHidden) {
                return;
            }
            if (add) {
                this.$scrollingElement[0].classList.add('o_wanim_overflow_x_hidden');
            } else if (!this.$scrollingElement.find('.o_animating').length) {
                this.$scrollingElement[0].classList.remove('o_wanim_overflow_x_hidden');
            }
        },
        getElementOffsetTop: function(el) {
            var top = 0;
            do {
                top += el.offsetTop || 0;
                el = el.offsetParent;
            } while (el);
            return top;
        },
    };
    publicWidget.registry.WebsiteAnimate = publicWidget.Widget.extend({
        selector: '#wrapwrap',
        disabledInEditableMode: false,
        start: function() {
            WebsiteAnimate.start();
            this.$target.find('.o_animate').css("visibility", "visible");
            return this._super.apply(this, arguments);
        },
        destroy: function() {
            WebsiteAnimate.$scrollingElement[0].classList.remove('o_wanim_overflow_x_hidden');
            this._super.apply(this, arguments);
            this.$target.find('.o_animate').removeClass('o_animating o_animated o_animate_preview o_animate_in_dropdown').css({
                'animation-name': '',
                'animation-play-state': '',
                'visibility': '',
            });
        },
    });
    publicWidget.registry.o_animate = publicWidget.Widget.extend({
        selector: '.o_animation',
        destroy: function() {
            this._super.apply(this, arguments);
            var old_animation_classes = "o_animation o_displayed o_displayed_top o_displayed_middle o_displayed_bottom o_visible o_visible_top o_visible_middle o_visible_bottom";
            $(".o_fade_in").addClass("o_animate o_anim_fade_in").removeClass("o_fade_in");
            $(".o_fade_in_down").addClass("o_animate o_anim_fade_in_down").removeClass("o_fade_in_down");
            $(".o_fade_in_left").addClass("o_animate o_anim_fade_in_left").removeClass("o_fade_in_left");
            $(".o_fade_in_right").addClass("o_animate o_anim_fade_in_right").removeClass("o_fade_in_right");
            $(".o_fade_in_up").addClass("o_animate o_anim_fade_in_up").removeClass("o_fade_in_up");
            this.$target.removeClass(old_animation_classes);
        },
    });
    return WebsiteAnimate;
});
;
/* /website_links/static/src/js/website_links.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_links.website_links', function(require) {
    'use strict';
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var _t = core._t;
    var SelectBox = publicWidget.Widget.extend({
        events: {
            'change': '_onChange',
        },
        init: function(parent, obj, placeholder) {
            this._super.apply(this, arguments);
            this.obj = obj;
            this.placeholder = placeholder;
        },
        willStart: function() {
            var self = this;
            var defs = [this._super.apply(this, arguments)];
            defs.push(this._rpc({
                model: this.obj,
                method: 'search_read',
                params: {
                    fields: ['id', 'name'],
                },
            }).then(function(result) {
                self.objects = _.map(result, function(val) {
                    return {
                        id: val.id,
                        text: val.name
                    };
                });
            }));
            return Promise.all(defs);
        },
        start: function() {
            var self = this;
            this.$el.select2({
                placeholder: self.placeholder,
                allowClear: true,
                createSearchChoice: function(term) {
                    if (self._objectExists(term)) {
                        return null;
                    }
                    return {
                        id: term,
                        text: _.str.sprintf("Create '%s'", term)
                    };
                },
                createSearchChoicePosition: 'bottom',
                multiple: false,
                data: self.objects,
                minimumInputLength: self.objects.length > 100 ? 3 : 0,
            });
        },
        _objectExists: function(query) {
            return _.find(this.objects, function(val) {
                return val.text.toLowerCase() === query.toLowerCase();
            }) !== undefined;
        },
        _createObject: function(name) {
            var self = this;
            var args = {
                name: name
            };
            if (this.obj === "utm.campaign") {
                args.is_website = true;
            }
            return this._rpc({
                model: this.obj,
                method: 'create',
                args: [args],
            }).then(function(record) {
                self.$el.attr('value', record);
                self.objects.push({
                    'id': record,
                    'text': name
                });
            });
        },
        _onChange: function(ev) {
            if (!ev.added || !_.isString(ev.added.id)) {
                return;
            }
            this._createObject(ev.added.id);
        },
    });
    var RecentLinkBox = publicWidget.Widget.extend({
        template: 'website_links.RecentLink',
        xmlDependencies: ['/website_links/static/src/xml/recent_link.xml'],
        events: {
            'click .btn_shorten_url_clipboard': '_toggleCopyButton',
            'click .o_website_links_edit_code': '_editCode',
            'click .o_website_links_ok_edit': '_onLinksOkClick',
            'click .o_website_links_cancel_edit': '_onLinksCancelClick',
            'submit #o_website_links_edit_code_form': '_onSubmitCode',
        },
        init: function(parent, obj) {
            this._super.apply(this, arguments);
            this.link_obj = obj;
            this.animating_copy = false;
        },
        start: function() {
            new ClipboardJS(this.$('.btn_shorten_url_clipboard').get(0));
            return this._super.apply(this, arguments);
        },
        _toggleCopyButton: function() {
            if (this.animating_copy) {
                return;
            }
            var self = this;
            this.animating_copy = true;
            var top = this.$('.o_website_links_short_url').position().top;
            this.$('.o_website_links_short_url').clone().css('position', 'absolute').css('left', 15).css('top', top - 2).css('z-index', 2).removeClass('o_website_links_short_url').addClass('animated-link').insertAfter(this.$('.o_website_links_short_url')).animate({
                opacity: 0,
                top: '-=20',
            }, 500, function() {
                self.$('.animated-link').remove();
                self.animating_copy = false;
            });
        },
        _notification: function(message) {
            this.$('.notification').append('<strong>' + message + '</strong>');
        },
        _editCode: function() {
            var initCode = this.$('#o_website_links_code').html();
            this.$('#o_website_links_code').html('<form style="display:inline;" id="o_website_links_edit_code_form"><input type="hidden" id="init_code" value="' + initCode + '"/><input type="text" id="new_code" value="' + initCode + '"/></form>');
            this.$('.o_website_links_edit_code').hide();
            this.$('.copy-to-clipboard').hide();
            this.$('.o_website_links_edit_tools').show();
        },
        _cancelEdit: function() {
            this.$('.o_website_links_edit_code').show();
            this.$('.copy-to-clipboard').show();
            this.$('.o_website_links_edit_tools').hide();
            this.$('.o_website_links_code_error').hide();
            var oldCode = this.$('#o_website_links_edit_code_form #init_code').val();
            this.$('#o_website_links_code').html(oldCode);
            this.$('#code-error').remove();
            this.$('#o_website_links_code form').remove();
        },
        _submitCode: function() {
            var self = this;
            var initCode = this.$('#o_website_links_edit_code_form #init_code').val();
            var newCode = this.$('#o_website_links_edit_code_form #new_code').val();
            if (newCode === '') {
                self.$('.o_website_links_code_error').html(_t("The code cannot be left empty"));
                self.$('.o_website_links_code_error').show();
                return;
            }
            function showNewCode(newCode) {
                self.$('.o_website_links_code_error').html('');
                self.$('.o_website_links_code_error').hide();
                self.$('#o_website_links_code form').remove();
                var host = self.$('#o_website_links_host').html();
                self.$('#o_website_links_code').html(newCode);
                self.$('.btn_shorten_url_clipboard').attr('data-clipboard-text', host + newCode);
                self.$('.o_website_links_edit_code').show();
                self.$('.copy-to-clipboard').show();
                self.$('.o_website_links_edit_tools').hide();
            }
            if (initCode === newCode) {
                showNewCode(newCode);
            } else {
                this._rpc({
                    route: '/website_links/add_code',
                    params: {
                        init_code: initCode,
                        new_code: newCode,
                    },
                }).then(function(result) {
                    showNewCode(result[0].code);
                }, function() {
                    self.$('.o_website_links_code_error').show();
                    self.$('.o_website_links_code_error').html(_t("This code is already taken"));
                });
            }
        },
        _onLinksOkClick: function(ev) {
            ev.preventDefault();
            this._submitCode();
        },
        _onLinksCancelClick: function(ev) {
            ev.preventDefault();
            this._cancelEdit();
        },
        _onSubmitCode: function(ev) {
            ev.preventDefault();
            this._submitCode();
        },
    });
    var RecentLinks = publicWidget.Widget.extend({
        getRecentLinks: function(filter) {
            var self = this;
            return this._rpc({
                route: '/website_links/recent_links',
                params: {
                    filter: filter,
                    limit: 20,
                },
            }).then(function(result) {
                _.each(result.reverse(), function(link) {
                    self._addLink(link);
                });
                self._updateNotification();
            }, function() {
                var message = _t("Unable to get recent links");
                self.$el.append('<div class="alert alert-danger">' + message + '</div>');
            });
        },
        _addLink: function(link) {
            var nbLinks = this.getChildren().length;
            var recentLinkBox = new RecentLinkBox(this,link);
            recentLinkBox.prependTo(this.$el);
            $('.link-tooltip').tooltip();
            if (nbLinks === 0) {
                this._updateNotification();
            }
        },
        removeLinks: function() {
            _.invoke(this.getChildren(), 'destroy');
        },
        _updateNotification: function() {
            if (this.getChildren().length === 0) {
                var message = _t("You don't have any recent links.");
                $('.o_website_links_recent_links_notification').html('<div class="alert alert-info">' + message + '</div>');
            } else {
                $('.o_website_links_recent_links_notification').empty();
            }
        },
    });
    publicWidget.registry.websiteLinks = publicWidget.Widget.extend({
        selector: '.o_website_links_create_tracked_url',
        events: {
            'click #filter-newest-links': '_onFilterNewestLinksClick',
            'click #filter-most-clicked-links': '_onFilterMostClickedLinksClick',
            'click #filter-recently-used-links': '_onFilterRecentlyUsedLinksClick',
            'click #generated_tracked_link a': '_onGeneratedTrackedLinkClick',
            'keyup #url': '_onUrlKeyUp',
            'click #btn_shorten_url': '_onShortenUrlButtonClick',
            'submit #o_website_links_link_tracker_form': '_onFormSubmit',
        },
        start: function() {
            var defs = [this._super.apply(this, arguments)];
            var campaignSelect = new SelectBox(this,'utm.campaign',_t("e.g. Promotion of June, Winter Newsletter, .."));
            defs.push(campaignSelect.attachTo($('#campaign-select')));
            var mediumSelect = new SelectBox(this,'utm.medium',_t("e.g. Newsletter, Social Network, .."));
            defs.push(mediumSelect.attachTo($('#channel-select')));
            var sourceSelect = new SelectBox(this,'utm.source',_t("e.g. Search Engine, Website page, .."));
            defs.push(sourceSelect.attachTo($('#source-select')));
            this.recentLinks = new RecentLinks(this);
            defs.push(this.recentLinks.appendTo($('#o_website_links_recent_links')));
            this.recentLinks.getRecentLinks('newest');
            new ClipboardJS($('#btn_shorten_url').get(0));
            this.url_copy_animating = false;
            $('[data-toggle="tooltip"]').tooltip();
            return Promise.all(defs);
        },
        _onFilterNewestLinksClick: function() {
            this.recentLinks.removeLinks();
            this.recentLinks.getRecentLinks('newest');
        },
        _onFilterMostClickedLinksClick: function() {
            this.recentLinks.removeLinks();
            this.recentLinks.getRecentLinks('most-clicked');
        },
        _onFilterRecentlyUsedLinksClick: function() {
            this.recentLinks.removeLinks();
            this.recentLinks.getRecentLinks('recently-used');
        },
        _onGeneratedTrackedLinkClick: function() {
            $('#generated_tracked_link a').text(_t("Copied")).removeClass('btn-primary').addClass('btn-success');
            setTimeout(function() {
                $('#generated_tracked_link a').text(_t("Copy")).removeClass('btn-success').addClass('btn-primary');
            }, 5000);
        },
        _onUrlKeyUp: function(ev) {
            if (!$('#btn_shorten_url').hasClass('btn-copy') || ev.which === 13) {
                return;
            }
            $('#btn_shorten_url').removeClass('btn-success btn-copy').addClass('btn-primary').html('Get tracked link');
            $('#generated_tracked_link').css('display', 'none');
            $('.o_website_links_utm_forms').show();
        },
        _onShortenUrlButtonClick: function() {
            if (!$('#btn_shorten_url').hasClass('btn-copy') || this.url_copy_animating) {
                return;
            }
            var self = this;
            this.url_copy_animating = true;
            $('#generated_tracked_link').clone().css('position', 'absolute').css('left', '78px').css('bottom', '8px').css('z-index', 2).removeClass('#generated_tracked_link').addClass('url-animated-link').appendTo($('#generated_tracked_link')).animate({
                opacity: 0,
                bottom: '+=20',
            }, 500, function() {
                $('.url-animated-link').remove();
                self.url_copy_animating = false;
            });
        },
        _onFormSubmit: function(ev) {
            var self = this;
            ev.preventDefault();
            if ($('#btn_shorten_url').hasClass('btn-copy')) {
                return;
            }
            ev.stopPropagation();
            var campaignID = $('#campaign-select').attr('value');
            var mediumID = $('#channel-select').attr('value');
            var sourceID = $('#source-select').attr('value');
            var params = {};
            params.url = $('#url').val();
            if (campaignID !== '') {
                params.campaign_id = parseInt(campaignID);
            }
            if (mediumID !== '') {
                params.medium_id = parseInt(mediumID);
            }
            if (sourceID !== '') {
                params.source_id = parseInt(sourceID);
            }
            $('#btn_shorten_url').text(_t("Generating link..."));
            this._rpc({
                route: '/website_links/new',
                params: params,
            }).then(function(result) {
                if ('error'in result) {
                    if (result.error === 'empty_url') {
                        $('.notification').html('<div class="alert alert-danger">The URL is empty.</div>');
                    } else if (result.error === 'url_not_found') {
                        $('.notification').html('<div class="alert alert-danger">URL not found (404)</div>');
                    } else {
                        $('.notification').html('<div class="alert alert-danger">An error occur while trying to generate your link. Try again later.</div>');
                    }
                } else {
                    var link = result[0];
                    $('#btn_shorten_url').removeClass('btn-primary').addClass('btn-success btn-copy').html('Copy');
                    $('#btn_shorten_url').attr('data-clipboard-text', link.short_url);
                    $('.notification').html('');
                    $('#generated_tracked_link').html(link.short_url);
                    $('#generated_tracked_link').css('display', 'inline');
                    self.recentLinks._addLink(link);
                    $('#campaign-select').select2('val', '');
                    $('#channel-select').select2('val', '');
                    $('#source-select').select2('val', '');
                    $('.o_website_links_utm_forms').hide();
                }
            });
        },
    });
    return {
        SelectBox: SelectBox,
        RecentLinkBox: RecentLinkBox,
        RecentLinks: RecentLinks,
    };
});
;
/* /website_links/static/src/js/website_links_code_editor.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_links.code_editor', function(require) {
    'use strict';
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var _t = core._t;
    publicWidget.registry.websiteLinksCodeEditor = publicWidget.Widget.extend({
        selector: '#wrapwrap:has(.o_website_links_edit_code)',
        events: {
            'click .o_website_links_edit_code': '_onEditCodeClick',
            'click .o_website_links_cancel_edit': '_onCancelEditClick',
            'submit #edit-code-form': '_onEditCodeFormSubmit',
            'click .o_website_links_ok_edit': '_onEditCodeFormSubmit',
        },
        _showNewCode: function(newCode) {
            $('.o_website_links_code_error').html('');
            $('.o_website_links_code_error').hide();
            $('#o_website_links_code form').remove();
            var host = $('#short-url-host').html();
            $('#o_website_links_code').html(newCode);
            $('.copy-to-clipboard').attr('data-clipboard-text', host + newCode);
            $('.o_website_links_edit_code').show();
            $('.copy-to-clipboard').show();
            $('.o_website_links_edit_tools').hide();
        },
        _submitCode: function() {
            var initCode = $('#edit-code-form #init_code').val();
            var newCode = $('#edit-code-form #new_code').val();
            var self = this;
            if (newCode === '') {
                self.$('.o_website_links_code_error').html(_t("The code cannot be left empty"));
                self.$('.o_website_links_code_error').show();
                return;
            }
            this._showNewCode(newCode);
            if (initCode === newCode) {
                this._showNewCode(newCode);
            } else {
                return this._rpc({
                    route: '/website_links/add_code',
                    params: {
                        init_code: initCode,
                        new_code: newCode,
                    },
                }).then(function(result) {
                    self._showNewCode(result[0].code);
                }, function() {
                    $('.o_website_links_code_error').show();
                    $('.o_website_links_code_error').html(_t("This code is already taken"));
                });
            }
            return Promise.resolve();
        },
        _onEditCodeClick: function() {
            var initCode = $('#o_website_links_code').html();
            $('#o_website_links_code').html('<form style="display:inline;" id="edit-code-form"><input type="hidden" id="init_code" value="' + initCode + '"/><input type="text" id="new_code" value="' + initCode + '"/></form>');
            $('.o_website_links_edit_code').hide();
            $('.copy-to-clipboard').hide();
            $('.o_website_links_edit_tools').show();
        },
        _onCancelEditClick: function(ev) {
            ev.preventDefault();
            $('.o_website_links_edit_code').show();
            $('.copy-to-clipboard').show();
            $('.o_website_links_edit_tools').hide();
            $('.o_website_links_code_error').hide();
            var oldCode = $('#edit-code-form #init_code').val();
            $('#o_website_links_code').html(oldCode);
            $('#code-error').remove();
            $('#o_website_links_code form').remove();
        },
        _onEditCodeFormSubmit: function(ev) {
            ev.preventDefault();
            this._submitCode();
        },
    });
});
;
/* /website_links/static/src/js/website_links_charts.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_links.charts', function(require) {
    'use strict';
    var core = require('web.core');
    var publicWidget = require('web.public.widget');
    var _t = core._t;
    var BarChart = publicWidget.Widget.extend({
        jsLibs: ['/web/static/lib/Chart/Chart.js', ],
        init: function(parent, beginDate, endDate, dates) {
            this._super.apply(this, arguments);
            this.beginDate = beginDate;
            this.endDate = endDate;
            this.number_of_days = this.endDate.diff(this.beginDate, 'days') + 2;
            this.dates = dates;
        },
        start: function() {
            var clicksArray = [];
            var beginDateCopy = this.beginDate;
            for (var i = 0; i < this.number_of_days; i++) {
                var dateKey = beginDateCopy.format('YYYY-MM-DD');
                clicksArray.push([dateKey, (dateKey in this.dates) ? this.dates[dateKey] : 0]);
                beginDateCopy.add(1, 'days');
            }
            var nbClicks = 0;
            var data = [];
            var labels = [];
            clicksArray.forEach(function(pt) {
                labels.push(pt[0]);
                nbClicks += pt[1];
                data.push(pt[1]);
            });
            this.$('.title').html(nbClicks + _t(' clicks'));
            var config = {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        fill: 'start',
                        label: _t('# of clicks'),
                        backgroundColor: '#ebf2f7',
                        borderColor: '#6aa1ca',
                    }],
                },
            };
            var canvas = this.$('canvas')[0];
            var context = canvas.getContext('2d');
            new Chart(context,config);
        },
    });
    var PieChart = publicWidget.Widget.extend({
        jsLibs: ['/web/static/lib/Chart/Chart.js', ],
        init: function(parent, data) {
            this._super.apply(this, arguments);
            this.data = data;
        },
        start: function() {
            var labels = [];
            var data = [];
            for (var i = 0; i < this.data.length; i++) {
                var countryName = this.data[i]['country_id'] ? this.data[i]['country_id'][1] : _t('Undefined');
                labels.push(countryName + ' (' + this.data[i]['country_id_count'] + ')');
                data.push(this.data[i]['country_id_count']);
            }
            this.$('.title').html(this.data.length + _t(' countries'));
            var config = {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        label: this.data.length > 0 ? this.data[0].key : _t('No data'),
                    }]
                },
            };
            var canvas = this.$('canvas')[0];
            var context = canvas.getContext('2d');
            new Chart(context,config);
        },
    });
    publicWidget.registry.websiteLinksCharts = publicWidget.Widget.extend({
        selector: '.o_website_links_chart',
        events: {
            'click .graph-tabs li a': '_onGraphTabClick',
            'click .copy-to-clipboard': '_onCopyToClipboardClick',
        },
        start: function() {
            var self = this;
            this.charts = {};
            var linkID = parseInt($('#link_id').val());
            this.links_domain = ['link_id', '=', linkID];
            var defs = [];
            defs.push(this._totalClicks());
            defs.push(this._clicksByDay());
            defs.push(this._clicksByCountry());
            defs.push(this._lastWeekClicksByCountry());
            defs.push(this._lastMonthClicksByCountry());
            defs.push(this._super.apply(this, arguments));
            new ClipboardJS($('.copy-to-clipboard')[0]);
            this.animating_copy = false;
            return Promise.all(defs).then(function(results) {
                var _totalClicks = results[0];
                var _clicksByDay = results[1];
                var _clicksByCountry = results[2];
                var _lastWeekClicksByCountry = results[3];
                var _lastMonthClicksByCountry = results[4];
                if (!_totalClicks) {
                    $('#all_time_charts').prepend(_t("There is no data to show"));
                    $('#last_month_charts').prepend(_t("There is no data to show"));
                    $('#last_week_charts').prepend(_t("There is no data to show"));
                    return;
                }
                var formattedClicksByDay = {};
                var beginDate;
                for (var i = 0; i < _clicksByDay.length; i++) {
                    var date = moment(_clicksByDay[i]['create_date:day'], 'DD MMMM YYYY');
                    if (i === 0) {
                        beginDate = date;
                    }
                    formattedClicksByDay[date.format('YYYY-MM-DD')] = _clicksByDay[i]['create_date_count'];
                }
                var now = moment();
                self.charts.all_time_bar = new BarChart(self,beginDate,now,formattedClicksByDay);
                self.charts.all_time_bar.attachTo($('#all_time_clicks_chart'));
                beginDate = moment().subtract(30, 'days');
                self.charts.last_month_bar = new BarChart(self,beginDate,now,formattedClicksByDay);
                self.charts.last_month_bar.attachTo($('#last_month_clicks_chart'));
                beginDate = moment().subtract(7, 'days');
                self.charts.last_week_bar = new BarChart(self,beginDate,now,formattedClicksByDay);
                self.charts.last_week_bar.attachTo($('#last_week_clicks_chart'));
                self.charts.all_time_pie = new PieChart(self,_clicksByCountry);
                self.charts.all_time_pie.attachTo($('#all_time_countries_charts'));
                self.charts.last_month_pie = new PieChart(self,_lastMonthClicksByCountry);
                self.charts.last_month_pie.attachTo($('#last_month_countries_charts'));
                self.charts.last_week_pie = new PieChart(self,_lastWeekClicksByCountry);
                self.charts.last_week_pie.attachTo($('#last_week_countries_charts'));
                var rowWidth = $('#all_time_countries_charts').parent().width();
                var $chartCanvas = $('#all_time_countries_charts,last_month_countries_charts,last_week_countries_charts').find('canvas');
                $chartCanvas.height(Math.max(_clicksByCountry.length * (rowWidth > 750 ? 1 : 2), 20) + 'em');
            });
        },
        _totalClicks: function() {
            return this._rpc({
                model: 'link.tracker.click',
                method: 'search_count',
                args: [[this.links_domain]],
            });
        },
        _clicksByDay: function() {
            return this._rpc({
                model: 'link.tracker.click',
                method: 'read_group',
                args: [[this.links_domain], ['create_date']],
                kwargs: {
                    groupby: 'create_date:day'
                },
            });
        },
        _clicksByCountry: function() {
            return this._rpc({
                model: 'link.tracker.click',
                method: 'read_group',
                args: [[this.links_domain], ['country_id']],
                kwargs: {
                    groupby: 'country_id'
                },
            });
        },
        _lastWeekClicksByCountry: function() {
            var interval = moment().subtract(7, 'days').format('YYYY-MM-DD');
            return this._rpc({
                model: 'link.tracker.click',
                method: 'read_group',
                args: [[this.links_domain, ['create_date', '>', interval]], ['country_id']],
                kwargs: {
                    groupby: 'country_id'
                },
            });
        },
        _lastMonthClicksByCountry: function() {
            var interval = moment().subtract(30, 'days').format('YYYY-MM-DD');
            return this._rpc({
                model: 'link.tracker.click',
                method: 'read_group',
                args: [[this.links_domain, ['create_date', '>', interval]], ['country_id']],
                kwargs: {
                    groupby: 'country_id'
                },
            });
        },
        _onGraphTabClick: function(ev) {
            ev.preventDefault();
            $('.graph-tabs li a').tab('show');
        },
        _onCopyToClipboardClick: function(ev) {
            ev.preventDefault();
            if (this.animating_copy) {
                return;
            }
            this.animating_copy = true;
            $('.o_website_links_short_url').clone().css('position', 'absolute').css('left', '15px').css('bottom', '10px').css('z-index', 2).removeClass('.o_website_links_short_url').addClass('animated-link').appendTo($('.o_website_links_short_url')).animate({
                opacity: 0,
                bottom: '+=20',
            }, 500, function() {
                $('.animated-link').remove();
                this.animating_copy = false;
            });
        },
    });
    return {
        BarChart: BarChart,
        PieChart: PieChart,
    };
});
;
/* /website_mass_mailing/static/src/js/website_mass_mailing.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('mass_mailing.website_integration', function(require) {
    "use strict";
    var config = require('web.config');
    var core = require('web.core');
    const dom = require('web.dom');
    var Dialog = require('web.Dialog');
    var utils = require('web.utils');
    var publicWidget = require('web.public.widget');
    const session = require('web.session');
    var _t = core._t;
    publicWidget.registry.subscribe = publicWidget.Widget.extend({
        selector: ".js_subscribe",
        disabledInEditableMode: false,
        read_events: {
            'click .js_subscribe_btn': '_onSubscribeClick',
        },
        init: function() {
            this._super(...arguments);
            const ReCaptchaService = odoo.__DEBUG__.services['google_recaptcha.ReCaptchaV3'];
            this._recaptcha = ReCaptchaService && new ReCaptchaService.ReCaptcha() || null;
        },
        willStart: function() {
            if (this._recaptcha) {
                this._recaptcha.loadLibs();
            }
            return this._super(...arguments);
        },
        start: function() {
            var self = this;
            var def = this._super.apply(this, arguments);
            if (!this._recaptcha && this.editableMode && session.is_admin) {
                this.displayNotification({
                    type: 'info',
                    message: _t("Do you want to install Google reCAPTCHA to secure your newsletter subscriptions?"),
                    sticky: true,
                    buttons: [{
                        text: _t("Install now"),
                        primary: true,
                        click: async () => {
                            dom.addButtonLoadingEffect($('.o_notification .btn-primary')[0]);
                            const record = await this._rpc({
                                model: 'ir.module.module',
                                method: 'search_read',
                                domain: [['name', '=', 'google_recaptcha']],
                                fields: ['id'],
                                limit: 1,
                            });
                            await this._rpc({
                                model: 'ir.module.module',
                                method: 'button_immediate_install',
                                args: [[record[0]['id']]],
                            });
                            this.displayNotification({
                                type: 'info',
                                message: _t("Google reCAPTCHA is now installed! You can configure it from your website settings."),
                                sticky: true,
                                buttons: [{
                                    text: _t("Website settings"),
                                    primary: true,
                                    click: async () => {
                                        window.open('/web#action=website.action_website_configuration', '_blank');
                                    }
                                }],
                            });
                        }
                    }],
                });
            }
            this.$popup = this.$target.closest('.o_newsletter_modal');
            if (this.$popup.length) {
                return def;
            }
            var always = function(data) {
                var isSubscriber = data.is_subscriber;
                self.$('.js_subscribe_btn').prop('disabled', isSubscriber);
                self.$('input.js_subscribe_email').val(data.email || "").prop('disabled', isSubscriber);
                self.$target.removeClass('d-none');
                self.$('.js_subscribe_btn').toggleClass('d-none', !!isSubscriber);
                self.$('.js_subscribed_btn').toggleClass('d-none', !isSubscriber);
            };
            return Promise.all([def, this._rpc({
                route: '/website_mass_mailing/is_subscriber',
                params: {
                    'list_id': this.$target.data('list-id'),
                },
            }).then(always).guardedCatch(always)]);
        },
        _onSubscribeClick: async function() {
            var self = this;
            var $email = this.$(".js_subscribe_email:visible");
            if ($email.length && !$email.val().match(/.+@.+/)) {
                this.$target.addClass('o_has_error').find('.form-control').addClass('is-invalid');
                return false;
            }
            this.$target.removeClass('o_has_error').find('.form-control').removeClass('is-invalid');
            let tokenObj = null;
            if (this._recaptcha) {
                tokenObj = await this._recaptcha.getToken('website_mass_mailing_subscribe');
                if (tokenObj.error) {
                    self.displayNotification({
                        type: 'danger',
                        title: _t("Error"),
                        message: tokenObj.error,
                        sticky: true,
                    });
                    return false;
                }
            }
            const params = {
                'list_id': this.$target.data('list-id'),
                'email': $email.length ? $email.val() : false,
            };
            if (this._recaptcha) {
                params['recaptcha_token_response'] = tokenObj.token;
            }
            this._rpc({
                route: '/website_mass_mailing/subscribe',
                params: params,
            }).then(function(result) {
                let toastType = result.toast_type;
                if (toastType === 'success') {
                    self.$(".js_subscribe_btn").addClass('d-none');
                    self.$(".js_subscribed_btn").removeClass('d-none');
                    self.$('input.js_subscribe_email').prop('disabled', !!result);
                    if (self.$popup.length) {
                        self.$popup.modal('hide');
                    }
                }
                self.displayNotification({
                    type: toastType,
                    title: toastType === 'success' ? _t('Success') : _t('Error'),
                    message: result.toast_content,
                    sticky: true,
                });
            });
        },
    });
    publicWidget.registry.newsletter_popup = publicWidget.Widget.extend({
        selector: ".o_newsletter_popup",
        disabledInEditableMode: false,
        start: function() {
            var self = this;
            var defs = [this._super.apply(this, arguments)];
            this.websiteID = this._getContext().website_id;
            this.listID = parseInt(this.$target.attr('data-list-id'));
            if (!this.listID || (utils.get_cookie(_.str.sprintf("newsletter-popup-%s-%s", this.listID, this.websiteID)) && !self.editableMode)) {
                return Promise.all(defs);
            }
            if (this.$target.data('content') && this.editableMode) {
                this._dialogInit(this.$target.data('content'));
                this.$target.removeData('quick-open');
                this.massMailingPopup.open();
            } else {
                defs.push(this._rpc({
                    route: '/website_mass_mailing/get_content',
                    params: {
                        newsletter_id: self.listID,
                    },
                }).then(function(data) {
                    self._dialogInit(data.popup_content, data.email || '');
                    if (!self.editableMode && !data.is_subscriber) {
                        if (config.device.isMobile) {
                            setTimeout(function() {
                                self._showBanner();
                            }, 5000);
                        } else {
                            $(document).on('mouseleave.open_popup_event', self._showBanner.bind(self));
                        }
                    } else {
                        $(document).off('mouseleave.open_popup_event');
                    }
                    if (self.$target.data('quick-open')) {
                        self.massMailingPopup.open();
                        self.$target.removeData('quick-open');
                    }
                }));
            }
            return Promise.all(defs);
        },
        destroy: function() {
            if (this.massMailingPopup) {
                this.massMailingPopup.close();
            }
            this._super.apply(this, arguments);
        },
        _dialogInit: function(content, email) {
            var self = this;
            this.massMailingPopup = new Dialog(this,{
                technical: false,
                $content: $('<div/>').html(content),
                $parentNode: this.$target,
                backdrop: !this.editableMode,
                dialogClass: 'p-0' + (this.editableMode ? ' oe_structure oe_empty' : ''),
                renderFooter: false,
                size: 'medium',
            });
            this.massMailingPopup.opened().then(function() {
                var $modal = self.massMailingPopup.$modal;
                $modal.find('header button.close').on('mouseup', function(ev) {
                    ev.stopPropagation();
                });
                $modal.addClass('o_newsletter_modal');
                $modal.find('.oe_structure').attr('data-editor-message', _t('DRAG BUILDING BLOCKS HERE'));
                $modal.find('.modal-dialog').addClass('modal-dialog-centered');
                $modal.find('.js_subscribe').data('list-id', self.listID).find('input.js_subscribe_email').val(email);
                self.trigger_up('widgets_start_request', {
                    editableMode: self.editableMode,
                    $target: $modal,
                });
            });
            this.massMailingPopup.on('closed', this, function() {
                var $modal = self.massMailingPopup.$modal;
                if ($modal) {
                    self.$el.data('content', $modal.find('.modal-body').html());
                }
            });
        },
        _showBanner: function() {
            this.massMailingPopup.open();
            utils.set_cookie(_.str.sprintf("newsletter-popup-%s-%s", this.listID, this.websiteID), true);
            $(document).off('mouseleave.open_popup_event');
        },
    });
});
;
/* /portal_rating/static/src/js/portal_chatter.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('rating.portal.chatter', function(require) {
    'use strict';
    var core = require('web.core');
    var portalChatter = require('portal.chatter');
    var utils = require('web.utils');
    var time = require('web.time');
    var _t = core._t;
    var PortalChatter = portalChatter.PortalChatter;
    var qweb = core.qweb;
    PortalChatter.include({
        events: _.extend({}, PortalChatter.prototype.events, {
            'click .o_website_rating_select': '_onClickStarDomain',
            'click .o_website_rating_select_text': '_onClickStarDomainReset',
            'click .o_wrating_js_publisher_comment_btn': '_onClickPublisherComment',
            'click .o_wrating_js_publisher_comment_edit': '_onClickPublisherComment',
            'click .o_wrating_js_publisher_comment_delete': '_onClickPublisherCommentDelete',
            'click .o_wrating_js_publisher_comment_submit': '_onClickPublisherCommentSubmit',
            'click .o_wrating_js_publisher_comment_cancel': '_onClickPublisherCommentCancel',
        }),
        xmlDependencies: (PortalChatter.prototype.xmlDependencies || []).concat(['/portal_rating/static/src/xml/portal_tools.xml', '/portal_rating/static/src/xml/portal_chatter.xml']),
        init: function(parent, options) {
            this._super.apply(this, arguments);
            if (!_.contains(this.options, 'display_rating')) {
                this.options = _.defaults(this.options, {
                    'display_rating': false,
                    'rating_default_value': 0.0,
                });
            }
            this.set('rating_card_values', {});
            this.set('rating_value', false);
            this.on("change:rating_value", this, this._onChangeRatingDomain);
        },
        preprocessMessages: function(messages) {
            var self = this;
            messages = this._super.apply(this, arguments);
            if (this.options['display_rating']) {
                _.each(messages, function(m, i) {
                    m.rating_value = self.roundToHalf(m['rating_value']);
                    m.rating = self._preprocessCommentData(m.rating, i);
                });
            }
            this.messages = messages;
            return messages;
        },
        roundToHalf: function(value) {
            var converted = parseFloat(value);
            var decimal = (converted - parseInt(converted, 10));
            decimal = Math.round(decimal * 10);
            if (decimal === 5) {
                return (parseInt(converted, 10) + 0.5);
            }
            if ((decimal < 3) || (decimal > 7)) {
                return Math.round(converted);
            } else {
                return (parseInt(converted, 10) + 0.5);
            }
        },
        _chatterInit: function() {
            var self = this;
            return this._super.apply(this, arguments).then(function(result) {
                if (!result['rating_stats']) {
                    return;
                }
                var ratingData = {
                    'avg': Math.round(result['rating_stats']['avg'] * 100) / 100,
                    'percent': [],
                };
                _.each(_.keys(result['rating_stats']['percent']).reverse(), function(rating) {
                    ratingData['percent'].push({
                        'num': rating,
                        'percent': utils.round_precision(result['rating_stats']['percent'][rating], 0.01),
                    });
                });
                self.set('rating_card_values', ratingData);
            });
        },
        _messageFetchPrepareParams: function() {
            var params = this._super.apply(this, arguments);
            if (this.options['display_rating']) {
                params['rating_include'] = true;
            }
            return params;
        },
        _newPublisherCommentData: function(messageIndex) {
            return {
                mes_index: messageIndex,
                publisher_id: this.options.partner_id,
                publisher_avatar: _.str.sprintf('/web/image/%s/%s/image_128/50x50', 'res.partner', this.options.partner_id),
                publisher_name: _t("Write your comment"),
                publisher_datetime: '',
                publisher_comment: '',
            };
        },
        _preprocessCommentData: function(rawRating, messageIndex) {
            var ratingData = {
                id: rawRating.id,
                mes_index: messageIndex,
                publisher_datetime: rawRating.publisher_datetime ? moment(time.str_to_datetime(rawRating.publisher_datetime)).format('MMMM Do YYYY, h:mm:ss a') : "",
                publisher_comment: rawRating.publisher_comment ? rawRating.publisher_comment : '',
            };
            if (rawRating.publisher_id && rawRating.publisher_id.length >= 2) {
                ratingData.publisher_id = rawRating.publisher_id[0];
                ratingData.publisher_name = rawRating.publisher_id[1];
                ratingData.publisher_avatar = _.str.sprintf('/web/image/%s/%s/image_128/50x50', 'res.partner', ratingData.publisher_id);
            }
            var commentData = _.extend(this._newPublisherCommentData(messageIndex), ratingData);
            return commentData;
        },
        _getCommentContainer: function($source) {
            return $source.parents(".o_wrating_publisher_container").first().find(".o_wrating_publisher_comment").first();
        },
        _getCommentButton: function($source) {
            return $source.parents(".o_wrating_publisher_container").first().find(".o_wrating_js_publisher_comment_btn").first();
        },
        _getCommentTextarea: function($source) {
            return $source.parents(".o_wrating_publisher_container").first().find(".o_portal_rating_comment_input").first();
        },
        _focusTextComment: function($source) {
            this._getCommentTextarea($source).focus();
        },
        _onClickStarDomain: function(ev) {
            var $tr = this.$(ev.currentTarget);
            var num = $tr.data('star');
            if ($tr.css('opacity') === '1') {
                this.set('rating_value', num);
                this.$('.o_website_rating_select').css({
                    'opacity': 0.5,
                });
                this.$('.o_website_rating_select_text[data-star="' + num + '"]').css({
                    'visibility': 'visible',
                    'opacity': 1,
                });
                this.$('.o_website_rating_select[data-star="' + num + '"]').css({
                    'opacity': 1,
                });
            }
        },
        _onClickStarDomainReset: function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            this.set('rating_value', false);
            this.$('.o_website_rating_select_text').css('visibility', 'hidden');
            this.$('.o_website_rating_select').css({
                'opacity': 1,
            });
        },
        _onClickPublisherComment: function(ev) {
            var $source = this.$(ev.currentTarget);
            if (this._getCommentTextarea($source).length === 1) {
                this._getCommentContainer($source).empty();
                return;
            }
            var messageIndex = $source.data("mes_index");
            var data = {
                is_publisher: this.options['is_user_publisher']
            };
            data.rating = this._newPublisherCommentData(messageIndex);
            var oldRating = this.messages[messageIndex].rating;
            data.rating.publisher_comment = oldRating.publisher_comment ? oldRating.publisher_comment : '';
            this._getCommentContainer($source).html($(qweb.render("portal_rating.chatter_rating_publisher_form", data)));
            this._focusTextComment($source);
        },
        _onClickPublisherCommentDelete: function(ev) {
            var self = this;
            var $source = this.$(ev.currentTarget);
            var messageIndex = $source.data("mes_index");
            var ratingId = this.messages[messageIndex].rating.id;
            this._rpc({
                route: '/website/rating/comment',
                params: {
                    "rating_id": ratingId,
                    "publisher_comment": ''
                }
            }).then(function(res) {
                self.messages[messageIndex].rating = self._preprocessCommentData(res, messageIndex);
                self._getCommentButton($source).removeClass("d-none");
                self._getCommentContainer($source).empty();
            });
        },
        _onClickPublisherCommentSubmit: function(ev) {
            var self = this;
            var $source = this.$(ev.currentTarget);
            var messageIndex = $source.data("mes_index");
            var comment = this._getCommentTextarea($source).val();
            var ratingId = this.messages[messageIndex].rating.id;
            this._rpc({
                route: '/website/rating/comment',
                params: {
                    "rating_id": ratingId,
                    "publisher_comment": comment
                }
            }).then(function(res) {
                self.messages[messageIndex].rating = self._preprocessCommentData(res, messageIndex);
                if (self.messages[messageIndex].rating.publisher_comment !== '') {
                    self._getCommentButton($source).addClass('d-none');
                    self._getCommentContainer($source).html($(qweb.render("portal_rating.chatter_rating_publisher_comment", {
                        rating: self.messages[messageIndex].rating,
                        is_publisher: self.options.is_user_publisher
                    })));
                } else {
                    self._getCommentButton($source).removeClass("d-none");
                    self._getCommentContainer($source).empty();
                }
            });
        },
        _onClickPublisherCommentCancel: function(ev) {
            var $source = this.$(ev.currentTarget);
            var messageIndex = $source.data("mes_index");
            var comment = this.messages[messageIndex].rating.publisher_comment;
            if (comment) {
                var data = {
                    rating: this.messages[messageIndex].rating,
                    is_publisher: this.options.is_user_publisher
                };
                this._getCommentContainer($source).html($(qweb.render("portal_rating.chatter_rating_publisher_comment", data)));
            } else {
                this._getCommentContainer($source).empty();
            }
        },
        _onChangeRatingDomain: function() {
            var domain = [];
            if (this.get('rating_value')) {
                domain = [['rating_value', '=', this.get('rating_value')]];
            }
            this._changeCurrentPage(1, domain);
        },
    });
});
;
/* /portal_rating/static/src/js/portal_composer.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('rating.portal.composer', function(require) {
    'use strict';
    var core = require('web.core');
    var portalComposer = require('portal.composer');
    var _t = core._t;
    var PortalComposer = portalComposer.PortalComposer;
    PortalComposer.include({
        events: _.extend({}, PortalComposer.prototype.events, {
            'click .stars i': '_onClickStar',
            'mouseleave .stars': '_onMouseleaveStarBlock',
            'mousemove .stars i': '_onMoveStar',
            'mouseleave .stars i': '_onMoveLeaveStar',
        }),
        init: function(parent, options) {
            this._super.apply(this, arguments);
            if (options.default_rating_value) {
                options.default_rating_value = parseFloat(options.default_rating_value);
            }
            this.options = _.defaults(this.options, {
                'default_message': false,
                'default_message_id': false,
                'default_rating_value': 0.0,
                'force_submit_url': false,
            });
            this.labels = {
                '0': "",
                '1': _t("I hate it"),
                '2': _t("I don't like it"),
                '3': _t("It's okay"),
                '4': _t("I like it"),
                '5': _t("I love it"),
            };
            this.user_click = false;
            this.set("star_value", this.options.default_rating_value);
            this.on("change:star_value", this, this._onChangeStarValue);
        },
        start: function() {
            var self = this;
            return this._super.apply(this, arguments).then(function() {
                self.$input = self.$('input[name="rating_value"]');
                self.$star_list = self.$('.stars').find('i');
                self.set("star_value", self.options.default_rating_value);
                self.$input.val(self.options.default_rating_value);
            });
        },
        _onChangeStarValue: function() {
            var val = this.get("star_value");
            var index = Math.floor(val);
            var decimal = val - index;
            this.$star_list.removeClass('fa-star fa-star-half-o').addClass('fa-star-o');
            this.$('.stars').find("i:lt(" + index + ")").removeClass('fa-star-o fa-star-half-o').addClass('fa-star');
            if (decimal) {
                this.$('.stars').find("i:eq(" + index + ")").removeClass('fa-star-o fa-star fa-star-half-o').addClass('fa-star-half-o');
            }
            this.$('.rate_text .badge').text(this.labels[index]);
        },
        _onClickStar: function(ev) {
            var index = this.$('.stars i').index(ev.currentTarget);
            this.set("star_value", index + 1);
            this.user_click = true;
            this.$input.val(this.get("star_value"));
        },
        _onMouseleaveStarBlock: function() {
            this.$('.rate_text').hide();
        },
        _onMoveStar: function(ev) {
            var index = this.$('.stars i').index(ev.currentTarget);
            this.$('.rate_text').show();
            this.set("star_value", index + 1);
        },
        _onMoveLeaveStar: function() {
            if (!this.user_click) {
                this.set("star_value", parseInt(this.$input.val()));
            }
            this.user_click = false;
        },
    });
});
;
/* /portal_rating/static/src/js/portal_rating_composer.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('portal.rating.composer', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    var session = require('web.session');
    var portalComposer = require('portal.composer');
    var PortalComposer = portalComposer.PortalComposer;
    var RatingPopupComposer = publicWidget.Widget.extend({
        template: 'portal_rating.PopupComposer',
        xmlDependencies: ['/portal/static/src/xml/portal_chatter.xml', '/portal_rating/static/src/xml/portal_tools.xml', '/portal_rating/static/src/xml/portal_rating_composer.xml', ],
        init: function(parent, options) {
            this._super.apply(this, arguments);
            this.rating_avg = Math.round(options['ratingAvg'] * 100) / 100 || 0.0;
            this.rating_total = options['ratingTotal'] || 0.0;
            this.options = _.defaults({}, options, {
                'token': false,
                'res_model': false,
                'res_id': false,
                'pid': 0,
                'display_composer': options['disable_composer'] ? false : !session.is_website_user,
                'display_rating': true,
                'csrf_token': odoo.csrf_token,
                'user_id': session.user_id,
            });
        },
        start: function() {
            var defs = [];
            defs.push(this._super.apply(this, arguments));
            this._composer = new PortalComposer(this,this.options);
            defs.push(this._composer.replace(this.$('.o_portal_chatter_composer')));
            return Promise.all(defs);
        },
    });
    publicWidget.registry.RatingPopupComposer = publicWidget.Widget.extend({
        selector: '.o_rating_popup_composer',
        start: function() {
            var ratingPopupData = this.$el.data();
            var ratingPopup = new RatingPopupComposer(this,ratingPopupData);
            return Promise.all([this._super.apply(this, arguments), ratingPopup.appendTo(this.$el)]);
        },
    });
    return RatingPopupComposer;
});
;
/* /web_tour/static/src/js/public/tour_manager.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('web_tour.public.TourManager', function(require) {
    'use strict';
    var TourManager = require('web_tour.TourManager');
    var lazyloader = require('web.public.lazyloader');
    TourManager.include({
        _waitBeforeTourStart: function() {
            return this._super.apply(this, arguments).then(function() {
                return lazyloader.allScriptsLoaded;
            }).then(function() {
                return new Promise(function(resolve) {
                    setTimeout(resolve);
                }
                );
            });
        },
    });
});
;
/* /bus/static/src/js/longpolling_bus.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('bus.Longpolling', function(require) {
    "use strict";
    var Bus = require('web.Bus');
    var ServicesMixin = require('web.ServicesMixin');
    var LongpollingBus = Bus.extend(ServicesMixin, {
        PARTNERS_PRESENCE_CHECK_PERIOD: 30000,
        ERROR_RETRY_DELAY: 10000,
        POLL_ROUTE: '/longpolling/poll',
        _isActive: null,
        _lastNotificationID: 0,
        _isOdooFocused: true,
        _pollRetryTimeout: null,
        init: function(parent, params) {
            this._super.apply(this, arguments);
            this._id = _.uniqueId('bus');
            this._longPollingBusId = this._id;
            this._options = {};
            this._channels = [];
            this._lastPresenceTime = new Date().getTime();
            $(window).on("focus." + this._longPollingBusId, this._onFocusChange.bind(this, {
                focus: true
            }));
            $(window).on("blur." + this._longPollingBusId, this._onFocusChange.bind(this, {
                focus: false
            }));
            $(window).on("unload." + this._longPollingBusId, this._onFocusChange.bind(this, {
                focus: false
            }));
            $(window).on("click." + this._longPollingBusId, this._onPresence.bind(this));
            $(window).on("keydown." + this._longPollingBusId, this._onPresence.bind(this));
            $(window).on("keyup." + this._longPollingBusId, this._onPresence.bind(this));
        },
        destroy: function() {
            this.stopPolling();
            $(window).off("focus." + this._longPollingBusId);
            $(window).off("blur." + this._longPollingBusId);
            $(window).off("unload." + this._longPollingBusId);
            $(window).off("click." + this._longPollingBusId);
            $(window).off("keydown." + this._longPollingBusId);
            $(window).off("keyup." + this._longPollingBusId);
            this._super();
        },
        addChannel: function(channel) {
            if (this._channels.indexOf(channel) === -1) {
                this._channels.push(channel);
                if (this._pollRpc) {
                    this._pollRpc.abort();
                } else {
                    this.startPolling();
                }
            }
        },
        deleteChannel: function(channel) {
            var index = this._channels.indexOf(channel);
            if (index !== -1) {
                this._channels.splice(index, 1);
                if (this._pollRpc) {
                    this._pollRpc.abort();
                }
            }
        },
        isOdooFocused: function() {
            return this._isOdooFocused;
        },
        startPolling: function() {
            if (this._isActive === null) {
                this._poll = this._poll.bind(this);
            }
            if (!this._isActive) {
                this._isActive = true;
                this._poll();
            }
        },
        stopPolling: function() {
            this._isActive = false;
            this._channels = [];
            clearTimeout(this._pollRetryTimeout);
            if (this._pollRpc) {
                this._pollRpc.abort();
            }
        },
        updateOption: function(key, value) {
            this._options[key] = value;
        },
        _getLastPresence: function() {
            return this._lastPresenceTime;
        },
        _poll: function() {
            var self = this;
            if (!this._isActive) {
                return;
            }
            var now = new Date().getTime();
            var options = _.extend({}, this._options, {
                bus_inactivity: now - this._getLastPresence(),
            });
            var data = {
                channels: this._channels,
                last: this._lastNotificationID,
                options: options
            };
            this._pollRpc = this._makePoll(data);
            this._pollRpc.then(function(result) {
                self._pollRpc = false;
                self._onPoll(result);
                self._poll();
            }).guardedCatch(function(result) {
                self._pollRpc = false;
                result.event.preventDefault();
                if (result.message === "XmlHttpRequestError abort") {
                    self._poll();
                } else {
                    self._pollRetryTimeout = setTimeout(self._poll, self.ERROR_RETRY_DELAY + (Math.floor((Math.random() * 20) + 1) * 1000));
                }
            });
        },
        _makePoll: function(data) {
            return this._rpc({
                route: this.POLL_ROUTE,
                params: data
            }, {
                shadow: true,
                timeout: 60000
            });
        },
        _onFocusChange: function(params) {
            this._isOdooFocused = params.focus;
            if (params.focus) {
                this._lastPresenceTime = new Date().getTime();
                this.trigger('window_focus', this._isOdooFocused);
            }
        },
        _onPoll: function(notifications) {
            var self = this;
            var notifs = _.map(notifications, function(notif) {
                if (notif.id > self._lastNotificationID) {
                    self._lastNotificationID = notif.id;
                }
                return [notif.channel, notif.message];
            });
            this.trigger("notification", notifs);
            return notifs;
        },
        _onPresence: function() {
            this._lastPresenceTime = new Date().getTime();
        },
    });
    return LongpollingBus;
});
;
/* /bus/static/src/js/crosstab_bus.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('bus.CrossTab', function(require) {
    "use strict";
    var Longpolling = require('bus.Longpolling');
    var session = require('web.session');
    var CrossTabBus = Longpolling.extend({
        TAB_HEARTBEAT_PERIOD: 10000,
        MASTER_TAB_HEARTBEAT_PERIOD: 1500,
        HEARTBEAT_OUT_OF_DATE_PERIOD: 5000,
        HEARTBEAT_KILL_OLD_PERIOD: 15000,
        LOCAL_STORAGE_PREFIX: 'bus',
        _isMasterTab: false,
        _isRegistered: false,
        init: function() {
            this._super.apply(this, arguments);
            var now = new Date().getTime();
            this._sanitizedOrigin = session.origin.replace(/:\/{0,2}/g, '_');
            this._id = _.uniqueId(this.LOCAL_STORAGE_PREFIX) + ':' + now;
            if (this._callLocalStorage('getItem', 'last_ts', 0) + 50000 < now) {
                this._callLocalStorage('removeItem', 'last');
            }
            this._lastNotificationID = this._callLocalStorage('getItem', 'last', 0);
            this.call('local_storage', 'onStorage', this, this._onStorage);
        },
        destroy: function() {
            this._super();
            clearTimeout(this._heartbeatTimeout);
        },
        addChannel: function() {
            this._super.apply(this, arguments);
            this._callLocalStorage('setItem', 'channels', this._channels);
        },
        deleteChannel: function() {
            this._super.apply(this, arguments);
            this._callLocalStorage('setItem', 'channels', this._channels);
        },
        getTabId: function() {
            return this._id;
        },
        isMasterTab: function() {
            return this._isMasterTab;
        },
        startPolling: function() {
            if (this._isActive === null) {
                this._heartbeat = this._heartbeat.bind(this);
            }
            if (!this._isRegistered) {
                this._isRegistered = true;
                var peers = this._callLocalStorage('getItem', 'peers', {});
                peers[this._id] = new Date().getTime();
                this._callLocalStorage('setItem', 'peers', peers);
                this._registerWindowUnload();
                if (!this._callLocalStorage('getItem', 'master')) {
                    this._startElection();
                }
                this._heartbeat();
                if (this._isMasterTab) {
                    this._callLocalStorage('setItem', 'channels', this._channels);
                    this._callLocalStorage('setItem', 'options', this._options);
                } else {
                    this._channels = this._callLocalStorage('getItem', 'channels', this._channels);
                    this._options = this._callLocalStorage('getItem', 'options', this._options);
                }
                return;
            }
            if (this._isMasterTab) {
                this._super.apply(this, arguments);
            }
        },
        updateOption: function() {
            this._super.apply(this, arguments);
            this._callLocalStorage('setItem', 'options', this._options);
        },
        _callLocalStorage: function(method, key, param) {
            return this.call('local_storage', method, this._generateKey(key), param);
        },
        _generateKey: function(key) {
            return this.LOCAL_STORAGE_PREFIX + '.' + this._sanitizedOrigin + '.' + key;
        },
        _getLastPresence: function() {
            return this._callLocalStorage('getItem', 'lastPresence') || this._super();
        },
        _heartbeat: function() {
            var now = new Date().getTime();
            var heartbeatValue = parseInt(this._callLocalStorage('getItem', 'heartbeat', 0));
            var peers = this._callLocalStorage('getItem', 'peers', {});
            if ((heartbeatValue + this.HEARTBEAT_OUT_OF_DATE_PERIOD) < now) {
                this._startElection();
                heartbeatValue = parseInt(this._callLocalStorage('getItem', 'heartbeat', 0));
            }
            if (this._isMasterTab) {
                var cleanedPeers = {};
                for (var peerName in peers) {
                    if (peers[peerName] + this.HEARTBEAT_KILL_OLD_PERIOD > now) {
                        cleanedPeers[peerName] = peers[peerName];
                    }
                }
                if (heartbeatValue !== this.lastHeartbeat) {
                    this._isMasterTab = false;
                    this.lastHeartbeat = 0;
                    peers[this._id] = now;
                    this._callLocalStorage('setItem', 'peers', peers);
                    this.stopPolling();
                    this.trigger('no_longer_master');
                } else {
                    this.lastHeartbeat = now;
                    this._callLocalStorage('setItem', 'heartbeat', now);
                    this._callLocalStorage('setItem', 'peers', cleanedPeers);
                }
            } else {
                peers[this._id] = now;
                this._callLocalStorage('setItem', 'peers', peers);
            }
            var hbPeriod = this._isMasterTab ? this.MASTER_TAB_HEARTBEAT_PERIOD : this.TAB_HEARTBEAT_PERIOD;
            if (this._lastPresenceTime + hbPeriod > now) {
                this._callLocalStorage('setItem', 'lastPresence', this._lastPresenceTime);
            }
            this._heartbeatTimeout = setTimeout(this._heartbeat.bind(this), hbPeriod);
        },
        _registerWindowUnload: function() {
            $(window).on('unload.' + this._id, this._onUnload.bind(this));
        },
        _startElection: function() {
            if (this._isMasterTab) {
                return;
            }
            var now = new Date().getTime();
            var peers = this._callLocalStorage('getItem', 'peers', {});
            var heartbeatKillOld = now - this.HEARTBEAT_KILL_OLD_PERIOD;
            var newMaster;
            for (var peerName in peers) {
                if (peers[peerName] < heartbeatKillOld) {
                    continue;
                }
                newMaster = peerName;
                break;
            }
            if (newMaster === this._id) {
                this.lastHeartbeat = now;
                this._callLocalStorage('setItem', 'heartbeat', this.lastHeartbeat);
                this._callLocalStorage('setItem', 'master', true);
                this._isMasterTab = true;
                this.startPolling();
                this.trigger('become_master');
                delete peers[newMaster];
                this._callLocalStorage('setItem', 'peers', peers);
            }
        },
        _onFocusChange: function(params) {
            this._super.apply(this, arguments);
            this._callLocalStorage('setItem', 'focus', params.focus);
        },
        _onPoll: function(notifications) {
            var notifs = this._super(notifications);
            if (this._isMasterTab && notifs.length) {
                this._callLocalStorage('setItem', 'last', this._lastNotificationID);
                this._callLocalStorage('setItem', 'last_ts', new Date().getTime());
                this._callLocalStorage('setItem', 'notification', notifs);
            }
        },
        _onStorage: function(e) {
            var value = JSON.parse(e.newValue);
            var key = e.key;
            if (this._isRegistered && key === this._generateKey('master') && !value) {
                this._startElection();
            }
            if (key === this._generateKey('last')) {
                this._lastNotificationID = value || 0;
            } else if (key === this._generateKey('notification')) {
                if (!this._isMasterTab) {
                    this.trigger("notification", value);
                }
            } else if (key === this._generateKey('channels')) {
                this._channels = value;
            } else if (key === this._generateKey('options')) {
                this._options = value;
            } else if (key === this._generateKey('focus')) {
                this._isOdooFocused = value;
                this.trigger('window_focus', this._isOdooFocused);
            }
        },
        _onUnload: function() {
            var peers = this._callLocalStorage('getItem', 'peers') || {};
            delete peers[this._id];
            this._callLocalStorage('setItem', 'peers', peers);
            if (this._isMasterTab) {
                this._callLocalStorage('removeItem', 'master');
            }
        },
    });
    return CrossTabBus;
});
;
/* /bus/static/src/js/services/bus_service.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('bus.BusService', function(require) {
    "use strict";
    var CrossTab = require('bus.CrossTab');
    var core = require('web.core');
    var ServicesMixin = require('web.ServicesMixin');
    const session = require('web.session');
    var BusService = CrossTab.extend(ServicesMixin, {
        dependencies: ['local_storage'],
        _audio: null,
        init: function(env) {
            this.env = env;
            this._super();
        },
        _trigger_up: function(ev) {
            if (ev.name === 'call_service') {
                const payload = ev.data;
                let args = payload.args || [];
                if (payload.service === 'ajax' && payload.method === 'rpc') {
                    args = args.concat(ev.target);
                }
                const service = this.env.services[payload.service];
                const result = service[payload.method].apply(service, args);
                payload.callback(result);
            }
        },
        start: function() {},
        sendNotification: function(title, content, callback) {
            if (window.Notification && Notification.permission === "granted") {
                if (this.isMasterTab()) {
                    try {
                        this._sendNativeNotification(title, content, callback);
                    } catch (error) {
                        if (error.message.indexOf('ServiceWorkerRegistration') > -1) {
                            this.do_notify(title, content);
                            this._beep();
                        } else {
                            throw error;
                        }
                    }
                }
            } else {
                this.do_notify(title, content);
                if (this.isMasterTab()) {
                    this._beep();
                }
            }
        },
        onNotification: function() {
            this.on.apply(this, ["notification"].concat(Array.prototype.slice.call(arguments)));
        },
        _beep: function() {
            if (typeof (Audio) !== "undefined") {
                if (!this._audio) {
                    this._audio = new Audio();
                    var ext = this._audio.canPlayType("audio/ogg; codecs=vorbis") ? ".ogg" : ".mp3";
                    this._audio.src = session.url("/mail/static/src/audio/ting" + ext);
                }
                Promise.resolve(this._audio.play()).catch(_.noop);
            }
        },
        _sendNativeNotification: function(title, content, callback) {
            var notification = new Notification(_.unescape(title),{
                body: _.unescape(content),
                icon: "/mail/static/src/img/odoobot_transparent.png"
            });
            notification.onclick = function() {
                window.focus();
                if (this.cancel) {
                    this.cancel();
                } else if (this.close) {
                    this.close();
                }
                if (callback) {
                    callback();
                }
            }
            ;
        },
    });
    core.serviceRegistry.add('bus_service', BusService);
    return BusService;
});
;
/* /web_unsplash/static/src/js/unsplash_beacon.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('web_unsplash.beacon', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    publicWidget.registry.UnsplashBeacon = publicWidget.Widget.extend({
        selector: '#wrapwrap',
        start: function() {
            var unsplashImages = _.map(this.$('img[src*="/unsplash/"]'), function(img) {
                return img.src.split('/unsplash/')[1].split('/')[0];
            });
            if (unsplashImages.length) {
                this._rpc({
                    route: '/web_unsplash/get_app_id',
                }).then(function(appID) {
                    if (!appID) {
                        return;
                    }
                    $.get('https://views.unsplash.com/v', {
                        'photo_id': unsplashImages.join(','),
                        'app_id': appID,
                    });
                });
            }
            return this._super.apply(this, arguments);
        },
    });
});
;
/* /auth_signup/static/src/js/signup.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('auth_signup.signup', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    publicWidget.registry.SignUpForm = publicWidget.Widget.extend({
        selector: '.oe_signup_form',
        events: {
            'submit': '_onSubmit',
        },
        _onSubmit: function() {
            var $btn = this.$('.oe_login_buttons > button[type="submit"]');
            $btn.attr('disabled', 'disabled');
            $btn.prepend('<i class="fa fa-refresh fa-spin"/> ');
        },
    });
});
;
/* /account/static/src/js/account_portal_sidebar.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('account.AccountPortalSidebar', function(require) {
    'use strict';
    const dom = require('web.dom');
    var publicWidget = require('web.public.widget');
    var PortalSidebar = require('portal.PortalSidebar');
    var utils = require('web.utils');
    publicWidget.registry.AccountPortalSidebar = PortalSidebar.extend({
        selector: '.o_portal_invoice_sidebar',
        events: {
            'click .o_portal_invoice_print': '_onPrintInvoice',
        },
        start: function() {
            var def = this._super.apply(this, arguments);
            var $invoiceHtml = this.$el.find('iframe#invoice_html');
            var updateIframeSize = this._updateIframeSize.bind(this, $invoiceHtml);
            $(window).on('resize', updateIframeSize);
            var iframeDoc = $invoiceHtml[0].contentDocument || $invoiceHtml[0].contentWindow.document;
            if (iframeDoc.readyState === 'complete') {
                updateIframeSize();
            } else {
                $invoiceHtml.on('load', updateIframeSize);
            }
            return def;
        },
        _updateIframeSize: function($el) {
            var $wrapwrap = $el.contents().find('div#wrapwrap');
            $el.height(0);
            $el.height($wrapwrap[0].scrollHeight);
            if (!utils.isValidAnchor(window.location.hash)) {
                return;
            }
            var $target = $(window.location.hash);
            if (!$target.length) {
                return;
            }
            dom.scrollTo($target[0], {
                duration: 0
            });
        },
        _onPrintInvoice: function(ev) {
            ev.preventDefault();
            var href = $(ev.currentTarget).attr('href');
            this._printIframeContent(href);
        },
    });
});
;
/* /payment/static/lib/jquery.payment/jquery.payment.js defined in bundle 'web.assets_frontend_lazy' */
(function() {
    var $, cardFromNumber, cardFromType, cards, defaultFormat, formatBackCardNumber, formatBackExpiry, formatCardNumber, formatExpiry, formatForwardExpiry, formatForwardSlashAndSpace, hasTextSelected, luhnCheck, reFormatCVC, reFormatCardNumber, reFormatExpiry, reFormatNumeric, replaceFullWidthChars, restrictCVC, restrictCardNumber, restrictExpiry, restrictNumeric, safeVal, setCardType, __slice = [].slice, __indexOf = [].indexOf || function(item) {
        for (var i = 0, l = this.length; i < l; i++) {
            if (i in this && this[i] === item)
                return i;
        }
        return -1;
    }
    ;
    $ = window.jQuery || window.Zepto || window.$;
    $.payment = {};
    $.payment.fn = {};
    $.fn.payment = function() {
        var args, method;
        method = arguments[0],
        args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        return $.payment.fn[method].apply(this, args);
    }
    ;
    defaultFormat = /(\d{1,4})/g;
    $.payment.cards = cards = [{
        type: 'maestro',
        patterns: [5018, 502, 503, 506, 56, 58, 639, 6220, 67],
        format: defaultFormat,
        length: [12, 13, 14, 15, 16, 17, 18, 19],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'forbrugsforeningen',
        patterns: [600],
        format: defaultFormat,
        length: [16],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'dankort',
        patterns: [5019],
        format: defaultFormat,
        length: [16],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'visa',
        patterns: [4],
        format: defaultFormat,
        length: [13, 16],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'mastercard',
        patterns: [51, 52, 53, 54, 55, 22, 23, 24, 25, 26, 27],
        format: defaultFormat,
        length: [16],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'amex',
        patterns: [34, 37],
        format: /(\d{1,4})(\d{1,6})?(\d{1,5})?/,
        length: [15],
        cvcLength: [3, 4],
        luhn: true
    }, {
        type: 'dinersclub',
        patterns: [30, 36, 38, 39],
        format: /(\d{1,4})(\d{1,6})?(\d{1,4})?/,
        length: [14],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'discover',
        patterns: [60, 64, 65, 622],
        format: defaultFormat,
        length: [16],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'unionpay',
        patterns: [62, 88],
        format: defaultFormat,
        length: [16, 17, 18, 19],
        cvcLength: [3],
        luhn: false
    }, {
        type: 'jcb',
        patterns: [35],
        format: defaultFormat,
        length: [16],
        cvcLength: [3],
        luhn: true
    }];
    cardFromNumber = function(num) {
        var card, p, pattern, _i, _j, _len, _len1, _ref;
        num = (num + '').replace(/\D/g, '');
        for (_i = 0,
        _len = cards.length; _i < _len; _i++) {
            card = cards[_i];
            _ref = card.patterns;
            for (_j = 0,
            _len1 = _ref.length; _j < _len1; _j++) {
                pattern = _ref[_j];
                p = pattern + '';
                if (num.substr(0, p.length) === p) {
                    return card;
                }
            }
        }
    }
    ;
    cardFromType = function(type) {
        var card, _i, _len;
        for (_i = 0,
        _len = cards.length; _i < _len; _i++) {
            card = cards[_i];
            if (card.type === type) {
                return card;
            }
        }
    }
    ;
    luhnCheck = function(num) {
        var digit, digits, odd, sum, _i, _len;
        odd = true;
        sum = 0;
        digits = (num + '').split('').reverse();
        for (_i = 0,
        _len = digits.length; _i < _len; _i++) {
            digit = digits[_i];
            digit = parseInt(digit, 10);
            if ((odd = !odd)) {
                digit *= 2;
            }
            if (digit > 9) {
                digit -= 9;
            }
            sum += digit;
        }
        return sum % 10 === 0;
    }
    ;
    hasTextSelected = function($target) {
        var _ref;
        if (($target.prop('selectionStart') != null) && $target.prop('selectionStart') !== $target.prop('selectionEnd')) {
            return true;
        }
        if ((typeof document !== "undefined" && document !== null ? (_ref = document.selection) != null ? _ref.createRange : void 0 : void 0) != null) {
            if (document.selection.createRange().text) {
                return true;
            }
        }
        return false;
    }
    ;
    safeVal = function(value, $target) {
        var currPair, cursor, digit, error, last, prevPair;
        try {
            cursor = $target.prop('selectionStart');
        } catch (_error) {
            error = _error;
            cursor = null;
        }
        last = $target.val();
        $target.val(value);
        if (cursor !== null && $target.is(":focus")) {
            if (cursor === last.length) {
                cursor = value.length;
            }
            if (last !== value) {
                prevPair = last.slice(cursor - 1, +cursor + 1 || 9e9);
                currPair = value.slice(cursor - 1, +cursor + 1 || 9e9);
                digit = value[cursor];
                if (/\d/.test(digit) && prevPair === ("" + digit + " ") && currPair === (" " + digit)) {
                    cursor = cursor + 1;
                }
            }
            $target.prop('selectionStart', cursor);
            return $target.prop('selectionEnd', cursor);
        }
    }
    ;
    replaceFullWidthChars = function(str) {
        var chars, chr, fullWidth, halfWidth, idx, value, _i, _len;
        if (str == null) {
            str = '';
        }
        fullWidth = '\uff10\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18\uff19';
        halfWidth = '0123456789';
        value = '';
        chars = str.split('');
        for (_i = 0,
        _len = chars.length; _i < _len; _i++) {
            chr = chars[_i];
            idx = fullWidth.indexOf(chr);
            if (idx > -1) {
                chr = halfWidth[idx];
            }
            value += chr;
        }
        return value;
    }
    ;
    reFormatNumeric = function(e) {
        var $target;
        $target = $(e.currentTarget);
        return setTimeout(function() {
            var value;
            value = $target.val();
            value = replaceFullWidthChars(value);
            value = value.replace(/\D/g, '');
            return safeVal(value, $target);
        });
    }
    ;
    reFormatCardNumber = function(e) {
        var $target;
        $target = $(e.currentTarget);
        return setTimeout(function() {
            var value;
            value = $target.val();
            value = replaceFullWidthChars(value);
            value = $.payment.formatCardNumber(value);
            return safeVal(value, $target);
        });
    }
    ;
    formatCardNumber = function(e) {
        var $target, card, digit, length, re, upperLength, value;
        digit = String.fromCharCode(e.which);
        if (!/^\d+$/.test(digit)) {
            return;
        }
        $target = $(e.currentTarget);
        value = $target.val();
        card = cardFromNumber(value + digit);
        length = (value.replace(/\D/g, '') + digit).length;
        upperLength = 16;
        if (card) {
            upperLength = card.length[card.length.length - 1];
        }
        if (length >= upperLength) {
            return;
        }
        if (($target.prop('selectionStart') != null) && $target.prop('selectionStart') !== value.length) {
            return;
        }
        if (card && card.type === 'amex') {
            re = /^(\d{4}|\d{4}\s\d{6})$/;
        } else {
            re = /(?:^|\s)(\d{4})$/;
        }
        if (re.test(value)) {
            e.preventDefault();
            return setTimeout(function() {
                return $target.val(value + ' ' + digit);
            });
        } else if (re.test(value + digit)) {
            e.preventDefault();
            return setTimeout(function() {
                return $target.val(value + digit + ' ');
            });
        }
    }
    ;
    formatBackCardNumber = function(e) {
        var $target, value;
        $target = $(e.currentTarget);
        value = $target.val();
        if (e.which !== 8) {
            return;
        }
        if (($target.prop('selectionStart') != null) && $target.prop('selectionStart') !== value.length) {
            return;
        }
        if (/\d\s$/.test(value)) {
            e.preventDefault();
            return setTimeout(function() {
                return $target.val(value.replace(/\d\s$/, ''));
            });
        } else if (/\s\d?$/.test(value)) {
            e.preventDefault();
            return setTimeout(function() {
                return $target.val(value.replace(/\d$/, ''));
            });
        }
    }
    ;
    reFormatExpiry = function(e) {
        var $target;
        $target = $(e.currentTarget);
        return setTimeout(function() {
            var value;
            value = $target.val();
            value = replaceFullWidthChars(value);
            value = $.payment.formatExpiry(value);
            return safeVal(value, $target);
        });
    }
    ;
    formatExpiry = function(e) {
        var $target, digit, val;
        digit = String.fromCharCode(e.which);
        if (!/^\d+$/.test(digit)) {
            return;
        }
        $target = $(e.currentTarget);
        val = $target.val() + digit;
        if (/^\d$/.test(val) && (val !== '0' && val !== '1')) {
            e.preventDefault();
            return setTimeout(function() {
                return $target.val("0" + val + " / ");
            });
        } else if (/^\d\d$/.test(val)) {
            e.preventDefault();
            return setTimeout(function() {
                var m1, m2;
                m1 = parseInt(val[0], 10);
                m2 = parseInt(val[1], 10);
                if (m2 > 2 && m1 !== 0) {
                    return $target.val("0" + m1 + " / " + m2);
                } else {
                    return $target.val("" + val + " / ");
                }
            });
        }
    }
    ;
    formatForwardExpiry = function(e) {
        var $target, digit, val;
        digit = String.fromCharCode(e.which);
        if (!/^\d+$/.test(digit)) {
            return;
        }
        $target = $(e.currentTarget);
        val = $target.val();
        if (/^\d\d$/.test(val)) {
            return $target.val("" + val + " / ");
        }
    }
    ;
    formatForwardSlashAndSpace = function(e) {
        var $target, val, which;
        which = String.fromCharCode(e.which);
        if (!(which === '/' || which === ' ')) {
            return;
        }
        $target = $(e.currentTarget);
        val = $target.val();
        if (/^\d$/.test(val) && val !== '0') {
            return $target.val("0" + val + " / ");
        }
    }
    ;
    formatBackExpiry = function(e) {
        var $target, value;
        $target = $(e.currentTarget);
        value = $target.val();
        if (e.which !== 8) {
            return;
        }
        if (($target.prop('selectionStart') != null) && $target.prop('selectionStart') !== value.length) {
            return;
        }
        if (/\d\s\/\s$/.test(value)) {
            e.preventDefault();
            return setTimeout(function() {
                return $target.val(value.replace(/\d\s\/\s$/, ''));
            });
        }
    }
    ;
    reFormatCVC = function(e) {
        var $target;
        $target = $(e.currentTarget);
        return setTimeout(function() {
            var value;
            value = $target.val();
            value = replaceFullWidthChars(value);
            value = value.replace(/\D/g, '').slice(0, 4);
            return safeVal(value, $target);
        });
    }
    ;
    restrictNumeric = function(e) {
        var input;
        if (e.metaKey || e.ctrlKey) {
            return true;
        }
        if (e.which === 32) {
            return false;
        }
        if (e.which === 0) {
            return true;
        }
        if (e.which < 33) {
            return true;
        }
        input = String.fromCharCode(e.which);
        return !!/[\d\s]/.test(input);
    }
    ;
    restrictCardNumber = function(e) {
        var $target, card, digit, value;
        $target = $(e.currentTarget);
        digit = String.fromCharCode(e.which);
        if (!/^\d+$/.test(digit)) {
            return;
        }
        if (hasTextSelected($target)) {
            return;
        }
        value = ($target.val() + digit).replace(/\D/g, '');
        card = cardFromNumber(value);
        if (card) {
            return value.length <= card.length[card.length.length - 1];
        } else {
            return value.length <= 16;
        }
    }
    ;
    restrictExpiry = function(e) {
        var $target, digit, value;
        $target = $(e.currentTarget);
        digit = String.fromCharCode(e.which);
        if (!/^\d+$/.test(digit)) {
            return;
        }
        if (hasTextSelected($target)) {
            return;
        }
        value = $target.val() + digit;
        value = value.replace(/\D/g, '');
        if (value.length > 6) {
            return false;
        }
    }
    ;
    restrictCVC = function(e) {
        var $target, digit, val;
        $target = $(e.currentTarget);
        digit = String.fromCharCode(e.which);
        if (!/^\d+$/.test(digit)) {
            return;
        }
        if (hasTextSelected($target)) {
            return;
        }
        val = $target.val() + digit;
        return val.length <= 4;
    }
    ;
    setCardType = function(e) {
        var $target, allTypes, card, cardType, val;
        $target = $(e.currentTarget);
        val = $target.val();
        cardType = $.payment.cardType(val) || 'unknown';
        if (!$target.hasClass(cardType)) {
            allTypes = (function() {
                var _i, _len, _results;
                _results = [];
                for (_i = 0,
                _len = cards.length; _i < _len; _i++) {
                    card = cards[_i];
                    _results.push(card.type);
                }
                return _results;
            }
            )();
            $target.removeClass('unknown');
            $target.removeClass(allTypes.join(' '));
            $target.addClass(cardType);
            $target.toggleClass('identified', cardType !== 'unknown');
            return $target.trigger('payment.cardType', cardType);
        }
    }
    ;
    $.payment.fn.formatCardCVC = function() {
        this.on('keypress', restrictNumeric);
        this.on('keypress', restrictCVC);
        this.on('paste', reFormatCVC);
        this.on('change', reFormatCVC);
        this.on('input', reFormatCVC);
        return this;
    }
    ;
    $.payment.fn.formatCardExpiry = function() {
        this.on('keypress', restrictNumeric);
        this.on('keypress', restrictExpiry);
        this.on('keypress', formatExpiry);
        this.on('keypress', formatForwardSlashAndSpace);
        this.on('keypress', formatForwardExpiry);
        this.on('keydown', formatBackExpiry);
        this.on('change', reFormatExpiry);
        this.on('input', reFormatExpiry);
        return this;
    }
    ;
    $.payment.fn.formatCardNumber = function() {
        this.on('keypress', restrictNumeric);
        this.on('keypress', restrictCardNumber);
        this.on('keypress', formatCardNumber);
        this.on('keydown', formatBackCardNumber);
        this.on('keyup', setCardType);
        this.on('paste', reFormatCardNumber);
        this.on('change', reFormatCardNumber);
        this.on('input', reFormatCardNumber);
        this.on('input', setCardType);
        return this;
    }
    ;
    $.payment.fn.restrictNumeric = function() {
        this.on('keypress', restrictNumeric);
        this.on('paste', reFormatNumeric);
        this.on('change', reFormatNumeric);
        this.on('input', reFormatNumeric);
        return this;
    }
    ;
    $.payment.fn.cardExpiryVal = function() {
        return $.payment.cardExpiryVal($(this).val());
    }
    ;
    $.payment.cardExpiryVal = function(value) {
        var month, prefix, year, _ref;
        _ref = value.split(/[\s\/]+/, 2),
        month = _ref[0],
        year = _ref[1];
        if ((year != null ? year.length : void 0) === 2 && /^\d+$/.test(year)) {
            prefix = (new Date).getFullYear();
            prefix = prefix.toString().slice(0, 2);
            year = prefix + year;
        }
        month = parseInt(month, 10);
        year = parseInt(year, 10);
        return {
            month: month,
            year: year
        };
    }
    ;
    $.payment.validateCardNumber = function(num) {
        var card, _ref;
        num = (num + '').replace(/\s+|-/g, '');
        if (!/^\d+$/.test(num)) {
            return false;
        }
        card = cardFromNumber(num);
        if (!card) {
            return false;
        }
        return (_ref = num.length,
        __indexOf.call(card.length, _ref) >= 0) && (card.luhn === false || luhnCheck(num));
    }
    ;
    $.payment.validateCardExpiry = function(month, year) {
        var currentTime, expiry, _ref;
        if (typeof month === 'object' && 'month'in month) {
            _ref = month,
            month = _ref.month,
            year = _ref.year;
        }
        if (!(month && year)) {
            return false;
        }
        month = $.trim(month);
        year = $.trim(year);
        if (!/^\d+$/.test(month)) {
            return false;
        }
        if (!/^\d+$/.test(year)) {
            return false;
        }
        if (!((1 <= month && month <= 12))) {
            return false;
        }
        if (year.length === 2) {
            if (year < 70) {
                year = "20" + year;
            } else {
                year = "19" + year;
            }
        }
        if (year.length !== 4) {
            return false;
        }
        expiry = new Date(year,month);
        currentTime = new Date;
        expiry.setMonth(expiry.getMonth() - 1);
        expiry.setMonth(expiry.getMonth() + 1, 1);
        return expiry > currentTime;
    }
    ;
    $.payment.validateCardCVC = function(cvc, type) {
        var card, _ref;
        cvc = $.trim(cvc);
        if (!/^\d+$/.test(cvc)) {
            return false;
        }
        card = cardFromType(type);
        if (card != null) {
            return _ref = cvc.length,
            __indexOf.call(card.cvcLength, _ref) >= 0;
        } else {
            return cvc.length >= 3 && cvc.length <= 4;
        }
    }
    ;
    $.payment.cardType = function(num) {
        var _ref;
        if (!num) {
            return null;
        }
        return ((_ref = cardFromNumber(num)) != null ? _ref.type : void 0) || null;
    }
    ;
    $.payment.formatCardNumber = function(num) {
        var card, groups, upperLength, _ref;
        num = num.replace(/\D/g, '');
        card = cardFromNumber(num);
        if (!card) {
            return num;
        }
        upperLength = card.length[card.length.length - 1];
        num = num.slice(0, upperLength);
        if (card.format.global) {
            return (_ref = num.match(card.format)) != null ? _ref.join(' ') : void 0;
        } else {
            groups = card.format.exec(num);
            if (groups == null) {
                return;
            }
            groups.shift();
            groups = $.grep(groups, function(n) {
                return n;
            });
            return groups.join(' ');
        }
    }
    ;
    $.payment.formatExpiry = function(expiry) {
        var mon, parts, sep, year;
        parts = expiry.match(/^\D*(\d{1,2})(\D+)?(\d{1,4})?/);
        if (!parts) {
            return '';
        }
        mon = parts[1] || '';
        sep = parts[2] || '';
        year = parts[3] || '';
        if (year.length > 0) {
            sep = ' / ';
        } else if (sep === ' /') {
            mon = mon.substring(0, 1);
            sep = '';
        } else if (mon.length === 2 || sep.length > 0) {
            sep = ' / ';
        } else if (mon.length === 1 && (mon !== '0' && mon !== '1')) {
            mon = "0" + mon;
            sep = ' / ';
        }
        return mon + sep + year;
    }
    ;
}
).call(this);
;
/* /payment/static/src/js/payment_portal.js defined in bundle 'web.assets_frontend_lazy' */
$(function() {
    $('input#cc_number').payment('formatCardNumber');
    $('input#cc_cvc').payment('formatCardCVC');
    $('input#cc_expiry').payment('formatCardExpiry')
    $('input#cc_number').on('focusout', function(e) {
        var valid_value = $.payment.validateCardNumber(this.value);
        var card_type = $.payment.cardType(this.value);
        if (card_type) {
            $(this).parent('.form-group').children('.card_placeholder').removeClass().addClass('card_placeholder ' + card_type);
            $(this).parent('.form-group').children('input[name="cc_brand"]').val(card_type)
        } else {
            $(this).parent('.form-group').children('.card_placeholder').removeClass().addClass('card_placeholder');
        }
        if (valid_value) {
            $(this).parent('.form-group').addClass('o_has_success').find('.form-control, .custom-select').addClass('is-valid');
            $(this).parent('.form-group').removeClass('o_has_error').find('.form-control, .custom-select').removeClass('is-invalid');
            $(this).siblings('.o_invalid_field').remove();
        } else {
            $(this).parent('.form-group').addClass('o_has_error').find('.form-control, .custom-select').addClass('is-invalid');
            $(this).parent('.form-group').removeClass('o_has_success').find('.form-control, .custom-select').removeClass('is-valid');
        }
    });
    $('input#cc_cvc').on('focusout', function(e) {
        var cc_nbr = $(this).parents('.oe_cc').find('#cc_number').val();
        var card_type = $.payment.cardType(cc_nbr);
        var valid_value = $.payment.validateCardCVC(this.value, card_type);
        if (valid_value) {
            $(this).parent('.form-group').addClass('o_has_success').find('.form-control, .custom-select').addClass('is-valid');
            $(this).parent('.form-group').removeClass('o_has_error').find('.form-control, .custom-select').removeClass('is-invalid');
            $(this).siblings('.o_invalid_field').remove();
        } else {
            $(this).parent('.form-group').addClass('o_has_error').find('.form-control, .custom-select').addClass('is-invalid');
            $(this).parent('.form-group').removeClass('o_has_success').find('.form-control, .custom-select').removeClass('is-valid');
        }
    });
    $('input#cc_expiry').on('focusout', function(e) {
        var expiry_value = $.payment.cardExpiryVal(this.value);
        var month = expiry_value.month || '';
        var year = expiry_value.year || '';
        var valid_value = $.payment.validateCardExpiry(month, year);
        if (valid_value) {
            $(this).parent('.form-group').addClass('o_has_success').find('.form-control, .custom-select').addClass('is-valid');
            $(this).parent('.form-group').removeClass('o_has_error').find('.form-control, .custom-select').removeClass('is-invalid');
            $(this).siblings('.o_invalid_field').remove();
        } else {
            $(this).parent('.form-group').addClass('o_has_error').find('.form-control, .custom-select').addClass('is-invalid');
            $(this).parent('.form-group').removeClass('o_has_success').find('.form-control, .custom-select').removeClass('is-valid');
        }
    });
    $('select[name="pm_acquirer_id"]').on('change', function() {
        var acquirer_id = $(this).val();
        $('.acquirer').addClass('d-none');
        $('.acquirer[data-acquirer-id="' + acquirer_id + '"]').removeClass('d-none');
    });
});
;
/* /payment/static/src/js/payment_form.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('payment.payment_form', function(require) {
    "use strict";
    var core = require('web.core');
    var Dialog = require('web.Dialog');
    var publicWidget = require('web.public.widget');
    var _t = core._t;
    publicWidget.registry.PaymentForm = publicWidget.Widget.extend({
        selector: '.o_payment_form',
        events: {
            'submit': 'onSubmit',
            'click #o_payment_form_pay': 'payEvent',
            'click #o_payment_form_add_pm': 'addPmEvent',
            'click button[name="delete_pm"]': 'deletePmEvent',
            'click .o_payment_form_pay_icon_more': 'onClickMorePaymentIcon',
            'click .o_payment_acquirer_select': 'radioClickEvent',
        },
        start: function() {
            this._adaptPayButton();
            window.addEventListener('pageshow', function(event) {
                if (event.persisted) {
                    window.location.reload();
                }
            });
            var self = this;
            return this._super.apply(this, arguments).then(function() {
                self.options = _.extend(self.$el.data(), self.options);
                self.updateNewPaymentDisplayStatus();
                $('[data-toggle="tooltip"]').tooltip();
            });
        },
        displayError: function(title, message) {
            var $checkedRadio = this.$('input[type="radio"]:checked')
              , acquirerID = this.getAcquirerIdFromRadio($checkedRadio[0]);
            var $acquirerForm;
            if (this.isNewPaymentRadio($checkedRadio[0])) {
                $acquirerForm = this.$('#o_payment_add_token_acq_' + acquirerID);
            } else if (this.isFormPaymentRadio($checkedRadio[0])) {
                $acquirerForm = this.$('#o_payment_form_acq_' + acquirerID);
            }
            if ($checkedRadio.length === 0) {
                return new Dialog(null,{
                    title: _t('Error: ') + _.str.escapeHTML(title),
                    size: 'medium',
                    $content: "<p>" + (_.str.escapeHTML(message) || "") + "</p>",
                    buttons: [{
                        text: _t('Ok'),
                        close: true
                    }]
                }).open();
            } else {
                this.$('#payment_error').remove();
                var messageResult = '<div class="alert alert-danger mb4" id="payment_error">';
                if (title != '') {
                    messageResult = messageResult + '<b>' + _.str.escapeHTML(title) + ':</b><br/>';
                }
                messageResult = messageResult + _.str.escapeHTML(message) + '</div>';
                $acquirerForm.append(messageResult);
            }
        },
        hideError: function() {
            this.$('#payment_error').remove();
        },
        getAcquirerIdFromRadio: function(element) {
            return $(element).data('acquirer-id');
        },
        getFormData: function($form) {
            var unindexed_array = $form.serializeArray();
            var indexed_array = {};
            $.map(unindexed_array, function(n, i) {
                indexed_array[n.name] = n.value;
            });
            return indexed_array;
        },
        isFormPaymentRadio: function(element) {
            return $(element).data('form-payment') === 'True';
        },
        isNewPaymentRadio: function(element) {
            return $(element).data('s2s-payment') === 'True';
        },
        updateNewPaymentDisplayStatus: function() {
            var checked_radio = this.$('input[type="radio"]:checked');
            this.$('[id*="o_payment_add_token_acq_"]').addClass('d-none');
            this.$('[id*="o_payment_form_acq_"]').addClass('d-none');
            if (checked_radio.length !== 1) {
                return;
            }
            checked_radio = checked_radio[0];
            var acquirer_id = this.getAcquirerIdFromRadio(checked_radio);
            if (this.isNewPaymentRadio(checked_radio)) {
                this.$('#o_payment_add_token_acq_' + acquirer_id).removeClass('d-none');
            } else if (this.isFormPaymentRadio(checked_radio)) {
                this.$('#o_payment_form_acq_' + acquirer_id).removeClass('d-none');
            }
        },
        disableButton: function(button) {
            $("body").block({
                overlayCSS: {
                    backgroundColor: "#000",
                    opacity: 0,
                    zIndex: 1050
                },
                message: false
            });
            $(button).attr('disabled', true);
            $(button).children('.fa-lock').removeClass('fa-lock');
            $(button).prepend('<span class="o_loader"><i class="fa fa-refresh fa-spin"></i>&nbsp;</span>');
        },
        enableButton: function(button) {
            $('body').unblock();
            $(button).attr('disabled', false);
            $(button).children('.fa').addClass('fa-lock');
            $(button).find('span.o_loader').remove();
        },
        _parseError: function(e) {
            if (e.message.data.arguments[1]) {
                return e.message.data.arguments[0] + e.message.data.arguments[1];
            }
            return e.message.data.arguments[0];
        },
        _adaptPayButton: function() {
            var $payButton = $("#o_payment_form_pay");
            var disabledReasons = $payButton.data('disabled_reasons') || {};
            $payButton.prop('disabled', _.contains(disabledReasons, true));
        },
        payEvent: function(ev) {
            ev.preventDefault();
            var form = this.el;
            var checked_radio = this.$('input[type="radio"]:checked');
            var self = this;
            if (ev.type === 'submit') {
                var button = $(ev.target).find('*[type="submit"]')[0]
            } else {
                var button = ev.target;
            }
            if (checked_radio.length === 1) {
                checked_radio = checked_radio[0];
                var acquirer_id = this.getAcquirerIdFromRadio(checked_radio);
                var acquirer_form = false;
                if (this.isNewPaymentRadio(checked_radio)) {
                    acquirer_form = this.$('#o_payment_add_token_acq_' + acquirer_id);
                } else {
                    acquirer_form = this.$('#o_payment_form_acq_' + acquirer_id);
                }
                var inputs_form = $('input', acquirer_form);
                var ds = $('input[name="data_set"]', acquirer_form)[0];
                if (this.isNewPaymentRadio(checked_radio)) {
                    if (this.options.partnerId === undefined) {
                        console.warn('payment_form: unset partner_id when adding new token; things could go wrong');
                    }
                    var form_data = this.getFormData(inputs_form);
                    var wrong_input = false;
                    inputs_form.toArray().forEach(function(element) {
                        if ($(element).attr('type') == 'hidden') {
                            return true;
                        }
                        $(element).closest('div.form-group').removeClass('o_has_error').find('.form-control, .custom-select').removeClass('is-invalid');
                        $(element).siblings(".o_invalid_field").remove();
                        $(element).trigger("focusout");
                        if (element.dataset.isRequired && element.value.length === 0) {
                            $(element).closest('div.form-group').addClass('o_has_error').find('.form-control, .custom-select').addClass('is-invalid');
                            $(element).closest('div.form-group').append('<div style="color: red" class="o_invalid_field" aria-invalid="true">' + _.str.escapeHTML("The value is invalid.") + '</div>');
                            wrong_input = true;
                        } else if ($(element).closest('div.form-group').hasClass('o_has_error')) {
                            wrong_input = true;
                            $(element).closest('div.form-group').append('<div style="color: red" class="o_invalid_field" aria-invalid="true">' + _.str.escapeHTML("The value is invalid.") + '</div>');
                        }
                    });
                    if (wrong_input) {
                        return;
                    }
                    this.disableButton(button);
                    return this._rpc({
                        route: ds.dataset.createRoute,
                        params: form_data,
                    }).then(function(data) {
                        if (data.result) {
                            if (data['3d_secure'] !== false) {
                                $("body").html(data['3d_secure']);
                            } else {
                                checked_radio.value = data.id;
                                form.submit();
                                return new Promise(function() {}
                                );
                            }
                        } else {
                            if (data.error) {
                                self.displayError('', data.error);
                            } else {
                                self.displayError(_t('Server Error'), _t('e.g. Your credit card details are wrong. Please verify.'));
                            }
                        }
                        self.enableButton(button);
                    }).guardedCatch(function(error) {
                        error.event.preventDefault();
                        self.enableButton(button);
                        self.displayError(_t('Server Error'), _t("We are not able to add your payment method at the moment.") + self._parseError(error));
                    });
                } else if (this.isFormPaymentRadio(checked_radio)) {
                    this.disableButton(button);
                    var $tx_url = this.$el.find('input[name="prepare_tx_url"]');
                    if ($tx_url.length === 1) {
                        var form_save_token = acquirer_form.find('input[name="o_payment_form_save_token"]').prop('checked');
                        return this._rpc({
                            route: $tx_url[0].value,
                            params: {
                                'acquirer_id': parseInt(acquirer_id),
                                'save_token': form_save_token,
                                'access_token': self.options.accessToken,
                                'success_url': self.options.successUrl,
                                'error_url': self.options.errorUrl,
                                'callback_method': self.options.callbackMethod,
                                'order_id': self.options.orderId,
                                'invoice_id': self.options.invoiceId,
                            },
                        }).then(function(result) {
                            if (result) {
                                var newForm = document.createElement('form');
                                newForm.setAttribute("method", self._get_redirect_form_method());
                                newForm.setAttribute("provider", checked_radio.dataset.provider);
                                newForm.hidden = true;
                                newForm.innerHTML = result;
                                var action_url = $(newForm).find('input[name="data_set"]').data('actionUrl');
                                newForm.setAttribute("action", action_url);
                                $(document.getElementsByTagName('body')[0]).append(newForm);
                                $(newForm).find('input[data-remove-me]').remove();
                                if (action_url) {
                                    newForm.submit();
                                    return new Promise(function() {}
                                    );
                                }
                            } else {
                                self.displayError(_t('Server Error'), _t("We are not able to redirect you to the payment form."));
                                self.enableButton(button);
                            }
                        }).guardedCatch(function(error) {
                            error.event.preventDefault();
                            self.displayError(_t('Server Error'), _t("We are not able to redirect you to the payment form.") + " " + self._parseError(error));
                            self.enableButton(button);
                        });
                    } else {
                        this.displayError(_t("Cannot setup the payment"), _t("We're unable to process your payment."));
                        self.enableButton(button);
                    }
                } else {
                    this.disableButton(button);
                    form.submit();
                    return new Promise(function() {}
                    );
                }
            } else {
                this.displayError(_t('No payment method selected'), _t('Please select a payment method.'));
                this.enableButton(button);
            }
        },
        _get_redirect_form_method: function() {
            return "post";
        },
        addPmEvent: function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            var checked_radio = this.$('input[type="radio"]:checked');
            var self = this;
            if (ev.type === 'submit') {
                var button = $(ev.target).find('*[type="submit"]')[0]
            } else {
                var button = ev.target;
            }
            if (checked_radio.length === 1 && this.isNewPaymentRadio(checked_radio[0])) {
                checked_radio = checked_radio[0];
                var acquirer_id = this.getAcquirerIdFromRadio(checked_radio);
                var acquirer_form = this.$('#o_payment_add_token_acq_' + acquirer_id);
                var inputs_form = $('input', acquirer_form);
                var form_data = this.getFormData(inputs_form);
                var ds = $('input[name="data_set"]', acquirer_form)[0];
                var wrong_input = false;
                inputs_form.toArray().forEach(function(element) {
                    if ($(element).attr('type') == 'hidden') {
                        return true;
                    }
                    $(element).closest('div.form-group').removeClass('o_has_error').find('.form-control, .custom-select').removeClass('is-invalid');
                    $(element).siblings(".o_invalid_field").remove();
                    $(element).trigger("focusout");
                    if (element.dataset.isRequired && element.value.length === 0) {
                        $(element).closest('div.form-group').addClass('o_has_error').find('.form-control, .custom-select').addClass('is-invalid');
                        var message = '<div style="color: red" class="o_invalid_field" aria-invalid="true">' + _.str.escapeHTML("The value is invalid.") + '</div>';
                        $(element).closest('div.form-group').append(message);
                        wrong_input = true;
                    } else if ($(element).closest('div.form-group').hasClass('o_has_error')) {
                        wrong_input = true;
                        var message = '<div style="color: red" class="o_invalid_field" aria-invalid="true">' + _.str.escapeHTML("The value is invalid.") + '</div>';
                        $(element).closest('div.form-group').append(message);
                    }
                });
                if (wrong_input) {
                    return;
                }
                $(button).attr('disabled', true);
                $(button).children('.fa-plus-circle').removeClass('fa-plus-circle');
                $(button).prepend('<span class="o_loader"><i class="fa fa-refresh fa-spin"></i>&nbsp;</span>');
                this._rpc({
                    route: ds.dataset.createRoute,
                    params: form_data,
                }).then(function(data) {
                    if (data.result) {
                        if (data['3d_secure'] !== false) {
                            $("body").html(data['3d_secure']);
                        } else {
                            if (form_data.return_url) {
                                window.location = form_data.return_url;
                            } else {
                                window.location.reload();
                            }
                        }
                    } else {
                        if (data.error) {
                            self.displayError('', data.error);
                        } else {
                            self.displayError(_t('Server Error'), _t('e.g. Your credit card details are wrong. Please verify.'));
                        }
                    }
                    $(button).attr('disabled', false);
                    $(button).children('.fa').addClass('fa-plus-circle');
                    $(button).find('span.o_loader').remove();
                }).guardedCatch(function(error) {
                    error.event.preventDefault();
                    $(button).attr('disabled', false);
                    $(button).children('.fa').addClass('fa-plus-circle');
                    $(button).find('span.o_loader').remove();
                    self.displayError(_t('Server error'), _t("We are not able to add your payment method at the moment.") + self._parseError(error));
                });
            } else {
                this.displayError(_t('No payment method selected'), _t('Please select the option to add a new payment method.'));
            }
        },
        onSubmit: function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            var button = $(ev.target).find('*[type="submit"]')[0]
            if (button.id === 'o_payment_form_pay') {
                return this.payEvent(ev);
            } else if (button.id === 'o_payment_form_add_pm') {
                return this.addPmEvent(ev);
            }
            return;
        },
        deletePmEvent: function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            var self = this;
            var pm_id = parseInt(ev.currentTarget.value);
            var tokenDelete = function() {
                self._rpc({
                    model: 'payment.token',
                    method: 'unlink',
                    args: [pm_id],
                }).then(function(result) {
                    if (result === true) {
                        ev.target.closest('div').remove();
                    }
                }, function() {
                    self.displayError(_t('Server Error'), _t("We are not able to delete your payment method at the moment."));
                });
            };
            this._rpc({
                model: 'payment.token',
                method: 'get_linked_records',
                args: [pm_id],
            }).then(function(result) {
                if (result[pm_id].length > 0) {
                    var content = '';
                    result[pm_id].forEach(function(sub) {
                        content += '<p><a href="' + sub.url + '" title="' + sub.description + '">' + sub.name + '</a></p>';
                    });
                    content = $('<div>').html('<p>' + _t('This card is currently linked to the following records:') + '</p>' + content);
                    new Dialog(self,{
                        title: _t('Warning!'),
                        size: 'medium',
                        $content: content,
                        buttons: [{
                            text: _t('Confirm Deletion'),
                            classes: 'btn-primary',
                            close: true,
                            click: tokenDelete
                        }, {
                            text: _t('Cancel'),
                            close: true
                        }]
                    }).open();
                } else {
                    tokenDelete();
                }
            }, function(err, event) {
                self.displayError(_t('Server Error'), _t("We are not able to delete your payment method at the moment.") + err.data.message);
            });
        },
        onClickMorePaymentIcon: function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var $listItems = $(ev.currentTarget).parents('ul').children('li');
            var $moreItem = $(ev.currentTarget).parents('li');
            $listItems.removeClass('d-none');
            $moreItem.addClass('d-none');
        },
        radioClickEvent: function(ev) {
            $(ev.currentTarget).find('input[type="radio"]').prop("checked", true);
            this.updateNewPaymentDisplayStatus();
        },
    });
    return publicWidget.registry.PaymentForm;
});
;
/* /payment/static/src/js/payment_processing.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('payment.processing', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    var ajax = require('web.ajax');
    var core = require('web.core');
    var _t = core._t;
    $.blockUI.defaults.css.border = '0';
    $.blockUI.defaults.css["background-color"] = '';
    $.blockUI.defaults.overlayCSS["opacity"] = '0.9';
    publicWidget.registry.PaymentProcessing = publicWidget.Widget.extend({
        selector: '.o_payment_processing',
        xmlDependencies: ['/payment/static/src/xml/payment_processing.xml'],
        _pollCount: 0,
        start: function() {
            this.displayLoading();
            this.poll();
            return this._super.apply(this, arguments);
        },
        startPolling: function() {
            var timeout = 3000;
            if (this._pollCount >= 10 && this._pollCount < 20) {
                timeout = 10000;
            } else if (this._pollCount >= 20) {
                timeout = 30000;
            }
            setTimeout(this.poll.bind(this), timeout);
            this._pollCount++;
        },
        poll: function() {
            var self = this;
            ajax.jsonRpc('/payment/process/poll', 'call', {}).then(function(data) {
                if (data.success === true) {
                    self.processPolledData(data.transactions);
                } else {
                    switch (data.error) {
                    case "tx_process_retry":
                        break;
                    case "no_tx_found":
                        self.displayContent("payment.no_tx_found", {});
                        break;
                    default:
                        self.displayContent("payment.exception", {
                            exception_msg: data.error
                        });
                        break;
                    }
                }
                self.startPolling();
            }).guardedCatch(function() {
                self.displayContent("payment.rpc_error", {});
                self.startPolling();
            });
        },
        processPolledData: function(transactions) {
            var render_values = {
                'tx_draft': [],
                'tx_pending': [],
                'tx_authorized': [],
                'tx_done': [],
                'tx_cancel': [],
                'tx_error': [],
            };
            if (transactions.length > 0 && ['transfer', 'sepa_direct_debit'].indexOf(transactions[0].acquirer_provider) >= 0) {
                window.location = transactions[0].return_url;
                return;
            }
            transactions.forEach(function(tx) {
                var key = 'tx_' + tx.state;
                if (key in render_values) {
                    render_values[key].push(tx);
                }
            });
            function countTxInState(states) {
                var nbTx = 0;
                for (var prop in render_values) {
                    if (states.indexOf(prop) > -1 && render_values.hasOwnProperty(prop)) {
                        nbTx += render_values[prop].length;
                    }
                }
                return nbTx;
            }
            if (countTxInState(['tx_done', 'tx_error', 'tx_pending', 'tx_authorized']) === 1) {
                var tx = render_values['tx_done'][0] || render_values['tx_authorized'][0] || render_values['tx_error'][0];
                if (tx) {
                    window.location = tx.return_url;
                    return;
                }
            }
            this.displayContent("payment.display_tx_list", render_values);
        },
        displayContent: function(xmlid, render_values) {
            var html = core.qweb.render(xmlid, render_values);
            $.unblockUI();
            this.$el.find('.o_payment_processing_content').html(html);
        },
        displayLoading: function() {
            var msg = _t("We are processing your payment, please wait ...");
            $.blockUI({
                'message': '<h2 class="text-white"><img src="/web/static/src/img/spin.png" class="fa-pulse"/>' + '    <br />' + msg + '</h2>'
            });
        },
    });
});
;
/* /sale/static/src/js/sale_portal_sidebar.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('sale.SalePortalSidebar', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    var PortalSidebar = require('portal.PortalSidebar');
    publicWidget.registry.SalePortalSidebar = PortalSidebar.extend({
        selector: '.o_portal_sale_sidebar',
        init: function(parent, options) {
            this._super.apply(this, arguments);
            this.authorizedTextTag = ['em', 'b', 'i', 'u'];
            this.spyWatched = $('body[data-target=".navspy"]');
        },
        start: function() {
            var def = this._super.apply(this, arguments);
            var $spyWatcheElement = this.$el.find('[data-id="portal_sidebar"]');
            this._setElementId($spyWatcheElement);
            this._generateMenu();
            if ($.bbq.getState('allow_payment') === 'yes' && this.$('#o_sale_portal_paynow').length) {
                this.$('#o_sale_portal_paynow').trigger('click');
                $.bbq.removeState('allow_payment');
            }
            return def;
        },
        _setElementId: function(prefix, $el) {
            var id = _.uniqueId(prefix);
            this.spyWatched.find($el).attr('id', id);
            return id;
        },
        _generateMenu: function() {
            var self = this
              , lastLI = false
              , lastUL = null
              , $bsSidenav = this.$el.find('.bs-sidenav');
            $("#quote_content [id^=quote_header_], #quote_content [id^=quote_]", this.spyWatched).attr("id", "");
            _.each(this.spyWatched.find("#quote_content h2, #quote_content h3"), function(el) {
                var id, text;
                switch (el.tagName.toLowerCase()) {
                case "h2":
                    id = self._setElementId('quote_header_', el);
                    text = self._extractText($(el));
                    if (!text) {
                        break;
                    }
                    lastLI = $("<li class='nav-item'>").append($('<a class="nav-link" style="max-width: 200px;" href="#' + id + '"/>').text(text)).appendTo($bsSidenav);
                    lastUL = false;
                    break;
                case "h3":
                    id = self._setElementId('quote_', el);
                    text = self._extractText($(el));
                    if (!text) {
                        break;
                    }
                    if (lastLI) {
                        if (!lastUL) {
                            lastUL = $("<ul class='nav flex-column'>").appendTo(lastLI);
                        }
                        $("<li class='nav-item'>").append($('<a class="nav-link" style="max-width: 200px;" href="#' + id + '"/>').text(text)).appendTo(lastUL);
                    }
                    break;
                }
                el.setAttribute('data-anchor', true);
            });
            this.trigger_up('widgets_start_request', {
                $target: $bsSidenav
            });
        },
        _extractText: function($node) {
            var self = this;
            var rawText = [];
            _.each($node.contents(), function(el) {
                var current = $(el);
                if ($.trim(current.text())) {
                    var tagName = current.prop("tagName");
                    if (_.isUndefined(tagName) || (!_.isUndefined(tagName) && _.contains(self.authorizedTextTag, tagName.toLowerCase()))) {
                        rawText.push($.trim(current.text()));
                    }
                }
            });
            return rawText.join(' ');
        },
    });
});
;
/* /sale_management/static/src/js/sale_management.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('sale_management.sale_management', function(require) {
    'use strict';
    var publicWidget = require('web.public.widget');
    publicWidget.registry.SaleUpdateLineButton = publicWidget.Widget.extend({
        selector: '.o_portal_sale_sidebar',
        events: {
            'click a.js_update_line_json': '_onClick',
            'click a.js_add_optional_products': '_onClickOptionalProduct',
            'change .js_quantity': '_onChangeQuantity'
        },
        async start() {
            await this._super(...arguments);
            this.orderDetail = this.$el.find('table#sales_order_table').data();
            this.elems = this._getUpdatableElements();
        },
        _onChangeQuantity(ev) {
            ev.preventDefault();
            let self = this
              , $target = $(ev.currentTarget)
              , quantity = parseInt($target.val());
            this._callUpdateLineRoute(self.orderDetail.orderId, {
                'line_id': $target.data('lineId'),
                'input_quantity': quantity >= 0 ? quantity : false,
                'access_token': self.orderDetail.token
            }).then( (data) => {
                self._updateOrderLineValues($target.closest('tr'), data);
                self._updateOrderValues(data);
            }
            );
        },
        _onClick(ev) {
            ev.preventDefault();
            let self = this
              , $target = $(ev.currentTarget);
            this._callUpdateLineRoute(self.orderDetail.orderId, {
                'line_id': $target.data('lineId'),
                'remove': $target.data('remove'),
                'unlink': $target.data('unlink'),
                'access_token': self.orderDetail.token
            }).then( (data) => {
                var $saleTemplate = $(data['sale_template']);
                if ($saleTemplate.length && data['unlink']) {
                    self.$('#portal_sale_content').html($saleTemplate);
                    self.elems = self._getUpdatableElements();
                }
                self._updateOrderLineValues($target.closest('tr'), data);
                self._updateOrderValues(data);
            }
            );
        },
        _onClickOptionalProduct(ev) {
            ev.preventDefault();
            let self = this
              , $target = $(ev.currentTarget);
            $target.css('pointer-events', 'none');
            this._rpc({
                route: "/my/orders/" + self.orderDetail.orderId + "/add_option/" + $target.data('optionId'),
                params: {
                    access_token: self.orderDetail.token
                }
            }).then( (data) => {
                if (data) {
                    self.$('#portal_sale_content').html($(data['sale_template']));
                    self.elems = self._getUpdatableElements();
                    self._updateOrderValues(data);
                }
            }
            );
        },
        _callUpdateLineRoute(order_id, params) {
            return this._rpc({
                route: "/my/orders/" + order_id + "/update_line_dict",
                params: params,
            });
        },
        _updateOrderLineValues($orderLine, data) {
            let linePriceTotal = data.order_line_price_total
              , linePriceSubTotal = data.order_line_price_subtotal
              , $linePriceTotal = $orderLine.find('.oe_order_line_price_total .oe_currency_value')
              , $linePriceSubTotal = $orderLine.find('.oe_order_line_price_subtotal .oe_currency_value');
            if (!$linePriceTotal.length && !$linePriceSubTotal.length) {
                $linePriceTotal = $linePriceSubTotal = $orderLine.find('.oe_currency_value').last();
            }
            $orderLine.find('.js_quantity').val(data.order_line_product_uom_qty);
            if ($linePriceTotal.length && linePriceTotal !== undefined) {
                $linePriceTotal.text(linePriceTotal);
            }
            if ($linePriceSubTotal.length && linePriceSubTotal !== undefined) {
                $linePriceSubTotal.text(linePriceSubTotal);
            }
        },
        _updateOrderValues(data) {
            let orderAmountTotal = data.order_amount_total
              , orderAmountUntaxed = data.order_amount_untaxed
              , orderAmountUndiscounted = data.order_amount_undiscounted
              , $orderTotalsTable = $(data.order_totals_table);
            if (orderAmountUntaxed !== undefined) {
                this.elems.$orderAmountUntaxed.text(orderAmountUntaxed);
            }
            if (orderAmountTotal !== undefined) {
                this.elems.$orderAmountTotal.text(orderAmountTotal);
            }
            if (orderAmountUndiscounted !== undefined) {
                this.elems.$orderAmountUndiscounted.text(orderAmountUndiscounted);
            }
            if ($orderTotalsTable.length) {
                this.elems.$orderTotalsTable.find('table').replaceWith($orderTotalsTable);
            }
        },
        _getUpdatableElements() {
            let $orderAmountUntaxed = $('[data-id="total_untaxed"]').find('span, b')
              , $orderAmountTotal = $('[data-id="total_amount"]').find('span, b')
              , $orderAmountUndiscounted = $('[data-id="amount_undiscounted"]').find('span, b');
            if (!$orderAmountUntaxed.length) {
                $orderAmountUntaxed = $orderAmountTotal.eq(1);
                $orderAmountTotal = $orderAmountTotal.eq(0).add($orderAmountTotal.eq(2));
            }
            return {
                $orderAmountUntaxed: $orderAmountUntaxed,
                $orderAmountTotal: $orderAmountTotal,
                $orderTotalsTable: $('#total'),
                $orderAmountUndiscounted: $orderAmountUndiscounted,
            };
        }
    });
});
;
/* /purchase/static/src/js/purchase_datetimepicker.js defined in bundle 'web.assets_frontend_lazy' */
$(function() {
    $('input.o-purchase-datetimepicker').datetimepicker();
    $('input.o-purchase-datetimepicker').on("hide.datetimepicker", function() {
        $(this).parents('form').submit();
    });
});

/* /planning/static/src/js/planning_calendar_front.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('planning.calendar_frontend', function(require) {
    "use strict";
    const publicWidget = require('web.public.widget');
    publicWidget.registry.PlanningView = publicWidget.Widget.extend({
        selector: '#calendar_employee',
        jsLibs: ['/web/static/lib/fullcalendar/core/main.js', '/web/static/lib/fullcalendar/core/locales-all.js', '/web/static/lib/fullcalendar/interaction/main.js', '/web/static/lib/fullcalendar/moment/main.js', '/web/static/lib/fullcalendar/daygrid/main.js', '/web/static/lib/fullcalendar/timegrid/main.js', '/web/static/lib/fullcalendar/list/main.js'],
        cssLibs: ['/web/static/lib/fullcalendar/core/main.css', '/web/static/lib/fullcalendar/daygrid/main.css', '/web/static/lib/fullcalendar/timegrid/main.css', '/web/static/lib/fullcalendar/list/main.css'],
        init: function(parent, options) {
            this._super.apply(this, arguments);
        },
        start: function() {
            if ($('.message_slug').attr('value')) {
                $("#PlanningToast").toast('show');
            }
            this._super.apply(this, arguments);
            this.calendarElement = this.$(".o_calendar_widget")[0];
            const employeeSlotsFcData = JSON.parse($('.employee_slots_fullcalendar_data').attr('value'));
            const openSlotsIds = $('.open_slots_ids').attr('value');
            const locale = $('.locale').attr('value');
            const defaultStart = moment($('.default_start').attr('value')).toDate();
            const defaultView = $('.default_view').attr('value');
            const minTime = $('.mintime').attr('value');
            const maxTime = $('.maxtime').attr('value');
            let calendarHeaders = {
                left: 'dayGridMonth,timeGridWeek,listMonth',
                center: 'title',
                right: 'today,prev,next'
            };
            if (employeeSlotsFcData.length === 0) {
                calendarHeaders = {
                    left: false,
                    center: 'title',
                    right: false,
                };
            }
            let titleFormat = 'MMMM YYYY';
            if (defaultView && (employeeSlotsFcData || openSlotsIds)) {
                this.calendar = new FullCalendar.Calendar($("#calendar_employee")[0],{
                    plugins: ['moment', 'dayGrid', 'timeGrid', 'list', 'interraction'],
                    locale: locale,
                    defaultView: defaultView,
                    navLinks: true,
                    eventLimit: true,
                    titleFormat: titleFormat,
                    defaultDate: defaultStart,
                    timeFormat: 'LT',
                    displayEventEnd: true,
                    height: 'auto',
                    eventTextColor: 'white',
                    eventOverlap: true,
                    eventTimeFormat: {
                        hour: 'numeric',
                        minute: '2-digit',
                        meridiem: 'long',
                        omitZeroMinute: true,
                    },
                    minTime: minTime,
                    maxTime: maxTime,
                    header: calendarHeaders,
                    events: employeeSlotsFcData,
                    eventClick: this.eventFunction,
                });
                this.calendar.setOption('locale', locale);
                this.calendar.render();
            }
        },
        eventFunction: function(calEvent) {
            const planningToken = $('.planning_token').attr('value');
            const employeeToken = $('.employee_token').attr('value');
            $(".modal-title").text(calEvent.event.title);
            $(".modal-header").css("background-color", calEvent.event.backgroundColor);
            $("#start").text(moment(calEvent.event.start).format("YYYY-MM-DD hh:mm A"));
            $("#stop").text(moment(calEvent.event.end).format("YYYY-MM-DD hh:mm A"));
            $("#alloc_hours").text(calEvent.event.extendedProps.alloc_hours);
            $("#role").text(calEvent.event.extendedProps.role);
            if (calEvent.event.extendedProps.alloc_perc !== 100) {
                $("#alloc_perc_value").text(calEvent.event.extendedProps.alloc_perc);
                $("#alloc_perc").css("display", "");
            } else {
                $("#alloc_perc").css("display", "none");
            }
            if (calEvent.event.extendedProps.role) {
                $("#role").prev().css("display", "");
                $("#role").text(calEvent.event.extendedProps.role);
                $("#role").css("display", "");
            } else {
                $("#role").prev().css("display", "none");
                $("#role").css("display", "none");
            }
            if (calEvent.event.extendedProps.note) {
                $("#note").prev().css("display", "");
                $("#note").text(calEvent.event.extendedProps.note);
                $("#note").css("display", "");
            } else {
                $("#note").prev().css("display", "none");
                $("#note").css("display", "none");
            }
            $("#allow_self_unassign").text(calEvent.event.extendedProps.allow_self_unassign);
            if (calEvent.event.extendedProps.allow_self_unassign) {
                document.getElementById("dismiss_shift").style.display = "block";
            } else {
                document.getElementById("dismiss_shift").style.display = "none";
            }
            $("#modal_action_dismiss_shift").attr("action", "/planning/" + planningToken + "/" + employeeToken + "/unassign/" + calEvent.event.extendedProps.slot_id);
            $("#fc-slot-onclick-modal").modal("show");
        },
    });
    return publicWidget.registry.PlanningView;
});
;
/* /project/static/src/js/portal_rating.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('website_rating_project.rating', function(require) {
    'use strict';
    var time = require('web.time');
    var publicWidget = require('web.public.widget');
    publicWidget.registry.ProjectRatingImage = publicWidget.Widget.extend({
        selector: '.o_portal_project_rating .o_rating_image',
        start: function() {
            this.$el.popover({
                placement: 'bottom',
                trigger: 'hover',
                html: true,
                content: function() {
                    var $elem = $(this);
                    var id = $elem.data('id');
                    var ratingDate = $elem.data('rating-date');
                    var baseDate = time.auto_str_to_date(ratingDate);
                    var duration = moment(baseDate).fromNow();
                    var $rating = $('#rating_' + id);
                    $rating.find('.rating_timeduration').text(duration);
                    return $rating.html();
                },
            });
            return this._super.apply(this, arguments);
        },
    });
});
;
/* /project_forecast/static/src/js/forecast_calendar_front.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('project_forecast.calendar_frontend', function(require) {
    "use strict";
    const PlanningView = require('planning.calendar_frontend');
    PlanningView.include({
        eventFunction: function(calEvent) {
            this._super.apply(this, arguments);
            if (calEvent.event.extendedProps.project) {
                $("#project").text(calEvent.event.extendedProps.project);
                $("#project").css("display", "");
                $("#project").prev().css("display", "");
            } else {
                $("#project").css("display", "none");
                $("#project").prev().css("display", "none");
            }
            if (calEvent.event.extendedProps.task) {
                $("#task").text(calEvent.event.extendedProps.task);
                $("#task").prev().css("display", "");
                $("#task").css("display", "");
            } else {
                $("#task").css("display", "none");
                $("#task").prev().css("display", "none");
            }
        },
    });
});
;
/* /google_recaptcha/static/src/js/recaptcha.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('google_recaptcha.ReCaptchaV3', function(require) {
    "use strict";
    const ajax = require('web.ajax');
    const Class = require('web.Class');
    const core = require('web.core');
    const _t = core._t;
    const ReCaptcha = Class.extend({
        init: function() {
            this._publicKey = odoo.reCaptchaPublicKey;
        },
        loadLibs: function() {
            if (this._publicKey) {
                this._recaptchaReady = ajax.loadJS(`https://www.recaptcha.net/recaptcha/api.js?render=${this._publicKey}`).then( () => new Promise(resolve => window.grecaptcha.ready( () => resolve())));
                return this._recaptchaReady.then( () => !!document.querySelector('.grecaptcha-badge'));
            }
            return false;
        },
        getToken: async function(action) {
            if (!this._publicKey) {
                return {
                    message: _t("No recaptcha site key set."),
                };
            }
            await this._recaptchaReady;
            try {
                return {
                    token: await window.grecaptcha.execute(this._publicKey, {
                        action: action
                    })
                };
            } catch (e) {
                return {
                    error: _t("The recaptcha site key is invalid."),
                };
            }
        },
    });
    return {
        ReCaptcha: ReCaptcha,
    };
});
;
/* /payment_mollie_official/static/src/js/payment_form.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('mollie.payment.form', function(require) {
    "use strict";
    var payement_form = require('payment.payment_form')
    var core = require('web.core');
    var Dialog = require('web.Dialog');
    var publicWidget = require('web.public.widget');
    var ajax = require('web.ajax');
    const qrDialog = require('mollie.qr.dialog');
    var _t = core._t;
    publicWidget.registry.PaymentForm.include({
        events: _.extend({
            'click .o_issuer': '_clickIssuer',
            'change input[name="mollieCardType"]': '_onChangeCardType',
        }, publicWidget.registry.PaymentForm.prototype.events),
        init: function() {
            this.mollie_loaded = false;
            this.mollieJSURL = "https://js.mollie.com/v1/mollie.js";
            return this._super.apply(this, arguments);
        },
        willStart: function() {
            var self = this;
            self.libPromise = ajax.loadJS(self.mollieJSURL);
            return this._super.apply(this, arguments).then(function() {
                return self.libPromise;
            });
        },
        start: function() {
            var self = this;
            return this._super.apply(this, arguments).then(function() {
                if (!window.ApplePaySession || !ApplePaySession.canMakePayments()) {
                    self.$('input[data-methodname="applepay"]').closest('.o_payment_acquirer_select').hide();
                    return;
                }
            });
        },
        updateNewPaymentDisplayStatus: function() {
            var self = this;
            var $checkedRadio = this.$('.o_payment_acquirer_select input[type="radio"]:checked');
            if ($checkedRadio.length !== 1) {
                return;
            }
            var response = this._super.apply(this, arguments);
            var provider = $checkedRadio.data('provider');
            var methodName = $checkedRadio.data('methodname');
            if (provider === 'mollie' && (methodName === 'creditcard' || methodName === 'ideal')) {
                this.$('[id*="o_payment_add_token_acq_"]').addClass('d-none');
                this.$('[id*="o_payment_form_acq_"]').addClass('d-none');
                this.$('#o_payment_form_acq_' + methodName).removeClass('d-none');
                if (!this.mollie_loaded && methodName === 'creditcard') {
                    this.mollie_loaded = true;
                    self.libPromise.then(function() {
                        self._loadMollieComponent();
                    });
                }
            }
            return response;
        },
        payEvent: function(ev) {
            ev.preventDefault();
            var form = this.el;
            var self = this;
            if (ev.type === 'submit') {
                var button = $(ev.target).find('*[type="submit"]')[0]
            } else {
                var button = ev.target;
            }
            var $checkedRadio = this.$('.o_payment_acquirer_select input[type="radio"]:checked');
            if ($checkedRadio.length === 1 && $checkedRadio.data('provider') === 'mollie') {
                this.disableButton(button);
                var methodName = $checkedRadio.data('methodname');
                const useSavedCard = this.$('#mollieSavedCard').prop('checked');
                if (methodName === 'creditcard' && this.$('#o_mollie_component').length && !useSavedCard) {
                    return this._getMollieToken(button).then(this._createMollieTransaction.bind(this, methodName, button));
                } else {
                    return this._createMollieTransaction(methodName, button);
                }
            } else {
                return this._super.apply(this, arguments);
            }
        },
        _loadMollieComponent: function() {
            var mollieProfileId = this.$('#o_mollie_component').data('profile_id');
            var mollieTestMode = this.$('#o_mollie_component').data('mode') === 'test';
            var context;
            this.trigger_up('context_get', {
                callback: function(ctx) {
                    context = ctx;
                },
            });
            var lang = context.lang || 'en_US';
            this.mollieComponent = Mollie(mollieProfileId, {
                locale: lang,
                testmode: mollieTestMode
            });
            this._bindMollieInputs();
        },
        _getMollieToken: function(button) {
            var self = this;
            return this.mollieComponent.createToken().then(function(result) {
                if (result.error) {
                    self.displayNotification({
                        type: 'danger',
                        title: _t("Error"),
                        message: result.error.message,
                        sticky: false,
                    });
                    self.enableButton(button);
                }
                return result.token || false;
            });
        },
        _createMollieTransaction: function(paymentmethod, button, token) {
            var self = this;
            var issuer = false;
            var checked_radio = this.$('.o_payment_acquirer_select input[type="radio"]:checked')[0];
            var acquirer_id = this.getAcquirerIdFromRadio(checked_radio);
            var $tx_url = this.$el.find('input[name="prepare_tx_url"]');
            if (paymentmethod === 'ideal') {
                issuer = this.$('#o_payment_form_acq_ideal .o_issuer.active').data('methodname');
            }
            let useSavedCard = $('#mollieSavedCard').prop('checked');
            if (paymentmethod === 'creditcard' && (this.$('#o_mollie_save_card').length || useSavedCard)) {
                useSavedCard = this.$('#o_mollie_save_card input').prop("checked") || useSavedCard;
            }
            if ($tx_url.length === 1) {
                return this._rpc({
                    route: $tx_url[0].value,
                    params: {
                        'acquirer_id': parseInt(acquirer_id),
                        'mollie_save_card': useSavedCard,
                        'access_token': this.options.accessToken,
                        'success_url': this.options.successUrl,
                        'error_url': this.options.errorUrl,
                        'callback_method': this.options.callbackMethod,
                        'order_id': this.options.orderId,
                        'mollie_payment_token': token,
                        'paymentmethod': paymentmethod,
                        'mollie_issuer': issuer
                    },
                }).then(function(result) {
                    if (result) {
                        var newForm = document.createElement('form');
                        newForm.setAttribute("method", "post");
                        newForm.setAttribute("provider", checked_radio.dataset.provider);
                        newForm.hidden = true;
                        newForm.innerHTML = result;
                        var action_url = $(newForm).find('input[name="data_set"]').data('actionUrl');
                        newForm.setAttribute("action", action_url);
                        $(document.getElementsByTagName('body')[0]).append(newForm);
                        $(newForm).find('input[data-remove-me]').remove();
                        var errorInput = $(newForm).find("input[name='error_msg']");
                        if (errorInput && errorInput.val()) {
                            var msg = _t('Payment method is not supported. Try another payment method or contact us');
                            var errorMsg = (errorInput.val() || "");
                            new Dialog(null,{
                                title: _t('Info'),
                                size: 'medium',
                                $content: _.str.sprintf('<p><b><b> %s </b> <br/> <span class="small text-muted"> Error Message: %s </span> </p>', msg, errorMsg),
                                buttons: [{
                                    text: _t('Ok'),
                                    close: true
                                }]
                            }).open();
                            self.enableButton(button);
                            return new Promise(function() {}
                            );
                        }
                        var qrInput = $(newForm).find("input[name='qr_src']");
                        if (qrInput.length) {
                            var dialog = new qrDialog(self,{
                                qrImgSrc: qrInput.val(),
                                submitRedirectForm: function() {
                                    newForm.submit()
                                },
                                size: 'small',
                                title: _t('Scan QR'),
                                renderFooter: false
                            });
                            var dialogDef = dialog.opened().then( () => {
                                self.enableButton(button);
                            }
                            );
                            dialog.open();
                            return dialogDef;
                        }
                        if (action_url) {
                            newForm.submit();
                            return new Promise(function() {}
                            );
                        }
                    } else {
                        self.displayError(_t('Server Error'), _t("We are not able to redirect you to the payment form."));
                        self.enableButton(button);
                    }
                }).guardedCatch(function(error) {
                    error.event.preventDefault();
                    self.displayError(_t('Server Error'), _t("We are not able to redirect you to the payment form.") + " " + self._parseError(error));
                });
            } else {
                this.displayError(_t("Cannot setup the payment"), _t("We're unable to process your payment."));
                self.enableButton(button);
            }
        },
        _bindMollieInputs: function() {
            var cardHolder = this.mollieComponent.createComponent('cardHolder');
            cardHolder.mount('#mollie-card-holder');
            var cardNumber = this.mollieComponent.createComponent('cardNumber');
            cardNumber.mount('#mollie-card-number');
            var expiryDate = this.mollieComponent.createComponent('expiryDate');
            expiryDate.mount('#mollie-expiry-date');
            var verificationCode = this.mollieComponent.createComponent('verificationCode');
            verificationCode.mount('#mollie-verification-code');
            var cardHolderError = this.$('#mollie-card-holder-error')[0];
            cardHolder.addEventListener('change', function(ev) {
                if (ev.error && ev.touched) {
                    cardHolderError.textContent = ev.error;
                } else {
                    cardHolderError.textContent = '';
                }
            });
            var cardNumberError = this.$('#mollie-card-number-error')[0];
            cardNumber.addEventListener('change', function(ev) {
                if (ev.error && ev.touched) {
                    cardNumberError.textContent = ev.error;
                } else {
                    cardNumberError.textContent = '';
                }
            });
            var expiryDateError = this.$('#mollie-expiry-date-error')[0];
            expiryDate.addEventListener('change', function(ev) {
                if (ev.error && ev.touched) {
                    expiryDateError.textContent = ev.error;
                } else {
                    expiryDateError.textContent = '';
                }
            });
            var verificationCodeError = this.$('#mollie-verification-code-error')[0];
            verificationCode.addEventListener('change', function(ev) {
                if (ev.error && ev.touched) {
                    verificationCodeError.textContent = ev.error;
                } else {
                    verificationCodeError.textContent = '';
                }
            });
        },
        _clickIssuer: function(ev) {
            var $container = $(ev.currentTarget).closest('.o_issuer_container');
            $container.find('.o_issuer').removeClass('active');
            $(ev.currentTarget).addClass('active');
        },
        _onChangeCardType: function(ev) {
            this.$('#o_mollie_component').toggleClass('d-none', $(ev.currentTarget).val() !== 'component');
            this.$('#o_mollie_save_card').toggleClass('d-none', $(ev.currentTarget).val() !== 'component');
        },
    });
});
;
/* /payment_mollie_official/static/src/js/qr_dialog.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define('mollie.qr.dialog', function(require) {
    "use strict";
    var core = require('web.core');
    const config = require('web.config');
    var Dialog = require('web.Dialog');
    var _t = core._t;
    var qweb = core.qweb;
    var QrModel = Dialog.extend({
        template: 'mollie.qr.dialog',
        xmlDependencies: (Dialog.prototype.xmlDependencies || []).concat(['/payment_mollie_official/static/src/xml/dialog.xml']),
        events: {
            "click .dr_continue_checkout": '_onClickContinue',
        },
        init: function(parent, options) {
            options = options || {};
            this.qrImgSrc = options.qrImgSrc;
            this.submitRedirectForm = options.submitRedirectForm;
            this._super(parent, $.extend(true, {}, options));
        },
        start: function() {
            this._poll();
            return this._super.apply(this, arguments);
        },
        _recallPolling: function() {
            setTimeout(this._poll.bind(this), 5000);
        },
        _poll: function() {
            var self = this;
            this._rpc({
                route: '/payment/process/poll',
                params: {
                    'csrf_token': core.csrf_token,
                }
            }).then(function(data) {
                console.log(data);
                if (data.success === true) {
                    if (data.transactions.length > 0) {
                        if (data.transactions[0].state != 'draft') {
                            window.location = data.transactions[0].return_url;
                            return;
                        }
                    }
                }
                self._recallPolling();
            }).guardedCatch(function() {
                self._recallPolling();
            });
        },
        _onClickContinue: function(ev) {
            this.submitRedirectForm();
        }
    });
    return QrModel;
});
