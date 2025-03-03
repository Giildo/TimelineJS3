import * as DOM from '../dom/DOM'
import { addClass } from '../dom/DOMUtil'
import { hexToRgb, mergeData, classMixin, isTrue, trace, addTraceHandler } from '../core/Util'
import { easeInOutQuint, easeOutStrong } from '../animation/Ease'
import Message from '../ui/Message'
import { Language, fallback, loadLanguage } from '../language/Language'
import { I18NMixins } from '../language/I18NMixins'
import Events from '../core/Events'
import { makeConfig } from '../core/ConfigFactory'
import { TimelineConfig } from '../core/TimelineConfig'
import { TimeNav } from '../timenav/TimeNav'
import * as Browser from '../core/Browser'
import { Animate } from '../animation/Animate'
import { StorySlider } from '../slider/StorySlider'
import { SlideNav } from '../slider/SlideNav'
import { Slide } from '../slider/Slide'
import { MenuBar } from '../ui/MenuBar'
import { loadCSS, loadJS } from '../core/Load'

let script_src_url = null
if (document) {
    let script_tags = document.getElementsByTagName('script')
    if (script_tags && script_tags.length > 0) {
        script_src_url = script_tags[script_tags.length - 1].src
    }
}

function make_keydown_handler (timeline) {
    return function (event) {
        if (timeline.config) {
            const keyName = event.key
            const currentSlide = timeline._getSlideIndex(self.current_id)
            const _n = timeline.config.events.length - 1
            const lastSlide = timeline.config.title ? _n + 1 : _n
            const firstSlide = 0

            if (keyName === 'ArrowLeft') {
                if (currentSlide !== firstSlide) {
                    timeline.goToPrev()
                }
            } else if (keyName === 'ArrowRight') {
                if (currentSlide !== lastSlide) {
                    timeline.goToNext()
                }
            }
        }
    }
}

/**
 * Primary entry point for using TimelineJS.
 * @constructor
 * @param {HTMLElement|string} elem - the HTML element, or its ID, to which
 *     the Timeline should be bound
 * @param {object|String} - a JavaScript object conforming to the TimelineJS
 *     configuration format, or a String which is the URL for a Google Sheets document
 *     or JSON configuration file which Timeline will retrieve and parse into a JavaScript object.
 *     NOTE: do not pass a JSON String for this. TimelineJS doesn't try to distinguish a
 *     JSON string from a URL string. If you have a JSON String literal, parse it using
 *     `JSON.parse` before passing it to the constructor.
 *
 * @param {object} [options] - a JavaScript object specifying
 *     presentation options
 */
class Timeline {
    constructor (elem, data, options) {
        if (!options) {
            options = {}
        }
        this.ready = false
        this._el = {
            container: DOM.get(elem),
            storyslider: {},
            timenav: {},
            menubar: {},
        }

        if (options.lang && !options.language) {
            options.language = options.lang
        }

        /** @type {Language} */
        this.language = fallback

        if (!options.headless) {
            /** @type {StorySlider} */
            this._storyslider = {}
        }

        /** @type {TimeNav} */
        this._timenav = {}

        /** @type {MenuBar} */
        this._menubar = {}

        // Loaded State
        this._loaded = { storyslider: false, timenav: false }

        /** @type {TimelineConfig} */
        this.config = null

        this.options = {
            base_class: 'tl-timeline', // removing tl-timeline will break all default stylesheets...
            debug: false,
            default_bg_color: { r: 255, g: 255, b: 255 },
            dragging: true, // interaction
            duration: 1000, // animation
            ease: easeInOutQuint,
            font: 'default',
            ga_property_id: null,
            hash_bookmark: false,
            headless: false,
            height: this._el.container.offsetHeight,
            is_embed: false,
            is_full_embed: false,
            language: 'en',
            layout: 'landscape', // portrait or landscape
            map_type: 'stamen:toner-lite',
            marker_height_min: 30, // Minimum Marker Height
            marker_padding: 5, // Top Bottom Marker Padding
            marker_width_min: 100, // Minimum Marker Width
            medium_size: 800,
            menubar_height: 0,
            optimal_tick_width: 60, // optimal distance (in pixels) between ticks on axis
            scale_factor: 2, // How many screen widths wide should the timeline be
            script_path: 'https://cdn.knightlab.com/libs/timeline3/latest/js/', // as good a default as any
            // sheets_proxy value should be suitable for simply postfixing with the Google Sheets CSV URL
            // as in include trailing slashes, or '?url=' or whatever. No support right now for anything but
            // postfixing. The default proxy should work in most cases, but only for TimelineJS sheets.
            sheets_proxy: 'https://sheets-proxy.knightlab.com/proxy/',
            skinny_size: 650,
            slide_default_fade: '0%', // landscape fade
            slide_padding_lr: 100, // padding on slide of slide
            soundcite: false,
            start_at_end: false,
            start_at_slide: 0,
            theme: null,
            timenav_height: null,
            timenav_height_min: 175, // Minimum timenav height
            timenav_height_percentage: 25, // Overrides timenav height as a percentage of the screen
            timenav_mobile_height_percentage: 40, // timenav height as a percentage on mobile devices
            timenav_position: 'bottom', // timeline on top or bottom
            trackResize: true,
            track_events: ['back_to_start', 'nav_next', 'nav_previous', 'zoom_in', 'zoom_out'],
            use_bc: false, // Use declared suffix on dates earlier than 0
            width: this._el.container.offsetWidth,
            zoom_sequence: [0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89], // Array of Fibonacci numbers for TimeNav zoom levels
        }

        // Animation Objects
        this.animator_timenav = null
        if (!options.headless) {
            this.animator_storyslider = null
        }
        this.animator_menubar = null

        // Ideally we'd set the language here, but we're bootstrapping and may hit problems
        // before we're able to load it. if it weren't a remote resource, we could probably
        // do it.
        this.message = new Message(this._el.container, { message_class: 'tl-message-full' })

        // Merge Options
        if (typeof (options.default_bg_color) == 'string') {
            const parsed = hexToRgb(options.default_bg_color) // will clear it out if its invalid
            if (parsed) {
                options.default_bg_color = parsed
            } else {
                delete options.default_bg_color
                trace('Invalid default background color. Ignoring.')
            }
        }
        mergeData(this.options, options)

        if (!(this.options.script_path)) {
            this.options.script_path = this.determineScriptPath()
        }

        if (options.soundcite) {
            this.on('ready', () => {
                trace('Loading Soundcite resources ')
                loadCSS('https://cdn.knightlab.com/libs/soundcite/latest/css/player.css')
                loadJS('https://cdn.knightlab.com/libs/soundcite/latest/js/soundcite.min.js')
            })
        }

        // load font, theme
        this._loadStyles()

        document.addEventListener('keydown', make_keydown_handler(this))
        window.addEventListener('resize', function (e) {
            this.updateDisplay()
        }.bind(this))

        if (this.options.debug) {
            addTraceHandler(console.log)
        }

        // Apply base class to container
        addClass(this._el.container, 'tl-timeline')

        if (this.options.is_embed) {
            addClass(this._el.container, 'tl-timeline-embed')
        }

        if (this.options.is_full_embed) {
            addClass(this._el.container, 'tl-timeline-full-embed')
        }

        this._loadLanguage(data)
    }

    /**
     * If the user has specified a font or theme, load the appropriate CSS file.
     * If not, use the defaults.
     */
    _loadStyles () {
        let font_css_url = null,
          theme_css_url = null

        if (
          this.options.font && (
            this.options.font.indexOf('http') === 0 ||
            this.options.font.match(/\.css$/)
          )
        ) {
            font_css_url = this.options.font
        } else if (this.options.font) {
            let fragment = '../css/fonts/font.' + this.options.font.toLowerCase() + '.css'
            font_css_url = new URL(fragment, this.options.script_path).toString()
        }

        if (font_css_url) {
            loadCSS(font_css_url)
        }

        if (
          this.options.theme && (
            this.options.theme.indexOf('http') === 0 ||
            this.options.theme.match(/\.css$/)
          )
        ) {
            theme_css_url = this.options.theme
        } else if (this.options.theme) {
            let fragment = '../css/themes/timeline.theme.' + this.options.theme.toLowerCase() + '.css'
            theme_css_url = new URL(fragment, this.options.script_path).toString()
        }

        if (theme_css_url) {
            loadCSS(theme_css_url)
        }
    }

    /**
     * It loads the language file for the language specified in the options, and then calls the `_initData` function.
     * If no language is specified, it will default to English.
     *
     * @param data - the data to be loaded into the timeline (events, title, etc)
     */
    _loadLanguage (data) {
        try {
            const lang = this.options.language
            const script_path = this.options.script_path
            loadLanguage(lang, script_path)
              .then((language) => {
                  if (language) {
                      this.language = language
                      this.message.setLanguage(this.language)
                      this.options.language = this.language // easiest way to make language available to I18NMixins
                      this.showMessage(this._('loading_timeline'))
                  } else {
                      this.showMessage(`Error loading ${lang}`) // but we will carry on using the fallback
                  }
                  this._initData(data)
              })
        } catch (e) {
            this.showMessage(this._translateError(e))
        }
    }

    /**
     * Initialize the data for this timeline. If data is a URL, pass it to ConfigFactory
     * to get a TimelineConfig; if data is a TimelineConfig, just use it; otherwise,
     * assume it's a JSON object in the right format, and wrap it in a new TimelineConfig.
     * @param {string|TimelineConfig|object} data
     */
    _initData (data) {
        if (typeof data === 'string') {
            makeConfig(data, {
                callback: function (config) {
                    this.setConfig(config)
                }.bind(this),
                sheets_proxy: this.options.sheets_proxy,
            })
        } else if (TimelineConfig === data.constructor) {
            this.setConfig(data)
        } else {
            this.setConfig(new TimelineConfig(data))
        }
    }

    /**
     * Given an input, if it is a Timeline Error object, look up the
     * appropriate error in the current language and return it, optionally
     * with detail that also comes in the object. Alternatively, pass back
     * the input, which is expected to be a string ready to display.
     * @param {Error|string} e - an Error object which can be localized,
     *     or a string message
     */
    _translateError (e) {
        if (e.hasOwnProperty('stack')) {
            trace(e.stack)
        }
        if (e.message_key) {
            return this._(e.message_key) + (e.detail ? ' [' + e.detail + ']' : '')
        }
        return e
    }

    /**
     * Display a message in the Timeline window.
     * @param {string} msg
     */
    showMessage (msg) {
        if (this.message) {
            this.message.updateMessage(msg)
        } else {
            trace('No message display available.')
            trace(msg)
        }
    }

    /**
     * Not ideal, but if users don't specify the script path, we try to figure it out.
     * The script path is needed to load other languages
     */
    determineScriptPath () {
        let src = null
        if (script_src_url) { // did we get it when this loaded?
            src = script_src_url
        } else {
            let script_tag = document.getElementById('timeline-script-tag')
            if (script_tag) {
                src = script_tag.src
            }
        }

        if (!src) {
            let script_tags = document.getElementsByTagName('script')
            for (let index = script_tags.length - 1; index >= 0; index--) {
                if (script_tags[index].src) {
                    src = script_tags[index].src
                    break // if we haven't found anything else, use the latest loaded script
                }
            }
        }

        if (src) {
            // +1 to include the trailing slash or concatting for dynamic CSS load won't work. Use substring because substr is deprecated
            return src.substring(0, src.lastIndexOf('/') + 1)
        }
        return ''
    }

    /**
     * The function `setConfig` is called when the user clicks the "Run" button. It takes the user's input and validates
     * it. If the input is valid, it calls the function `_onDataLoaded` which is defined in the same file. If the input is
     * invalid, it displays an error message.
     *
     * @param config - The configuration object.
     */
    setConfig (config) {
        this.config = config
        if (this.config.isValid()) {
            // don't validate if it's already problematic to avoid clutter
            this.config.validate()
            this._validateOptions()
        }
        if (this.config.isValid()) {
            try {
                if (document.readyState === 'loading') { // Loading hasn't finished yet
                    document.addEventListener('DOMContentLoaded', this._onDataLoaded.bind(this))
                } else {
                    this._onDataLoaded()
                }
            } catch (e) {
                this.showMessage('<strong>' + this._('error') + ':</strong> ' + this._translateError(e))
            }
        } else {
            const translated_errs = []

            for (let i = 0, errs = this.config.getErrors(); i < errs.length; i++) {
                translated_errs.push(this._translateError(errs[i]))
            }

            this.showMessage('<strong>' + this._('error') + ':</strong> ' + translated_errs.join('<br>'))
            // should we set 'self.ready'? if not, it won't resize,
            // but most resizing would only work
            // if more setup happens
        }
    }

    /**
     * _onDataLoaded() is a function that fires the event "dataloaded", initializes the layout, initializes the events,
     * initializes the analytics, hides the message, and then creates an intersection observer that updates the display
     * when the container is intersecting.
     *
     * @private
     */
    _onDataLoaded () {
        this.fire('dataloaded')
        this._initLayout()
        this._initEvents()
        this._initAnalytics()
        if (this.message) {
            this.message.hide()
        }
        let callback = (entries, observer) => {
            if (entries.reduce((accum, curr) => accum || curr.isIntersecting, false)) {
                this.updateDisplay()
            }
        }
        let observer = new IntersectionObserver(callback.bind(this))
        observer.observe(this._el.container)
        this.ready = true
        this.fire('ready')
    }

    /**
     * _initLayout() is a function that creates the layout of the timeline.
     *
     * @private
     */
    _initLayout () {
        this.message.removeFrom(this._el.container)
        this._el.container.innerHTML = ''

        // Create Layout
        if (this.options.timenav_position === 'top') {
            this._el.timenav = DOM.create('div', 'tl-timenav', this._el.container)

            if (!this.options.headless) {
                this._el.storyslider = DOM.create('div', 'tl-storyslider', this._el.container)
            }
        } else {
            if (!this.options.headless) {
                this._el.storyslider = DOM.create('div', 'tl-storyslider', this._el.container)
            }

            this._el.timenav = DOM.create('div', 'tl-timenav', this._el.container)
        }

        this._el.menubar = DOM.create('div', 'tl-menubar', this._el.container)

        // Initial Default Layout
        this.options.width = this._el.container.offsetWidth
        this.options.height = this._el.container.offsetHeight
        // this._el.storyslider.style.top  = "1px";

        // Set TimeNav Height
        this.options.timenav_height = this._calculateTimeNavHeight(this.options.timenav_height)

        if (this.options.headless) {
            // Create Navigation icons
            this._el.next = new SlideNav(
              { title: 'Next', description: 'description' },
              { direction: 'next', headless: this.options.headless },
            )
            this._el.next.addTo(this._el.container)
            let iconNextHeight = this._el.next._el.icon.getBoundingClientRect() || 0
            if (iconNextHeight) {
                iconNextHeight = iconNextHeight.height
            }
            this._el.next.setPosition({ top: Math.ceil(this.options.timenav_height) / 2 - iconNextHeight })

            this._el.previous = new SlideNav(
              { title: 'Previous', description: 'description' },
              { direction: 'previous', headless: this.options.headless },
            )
            this._el.previous.addTo(this._el.container)
            let iconPreviousHeight = this._el.previous._el.icon.getBoundingClientRect() || 0
            if (iconPreviousHeight) {
                iconPreviousHeight = iconPreviousHeight.height
            }
            this._el.previous.setPosition({
                top: Math.ceil(this.options.timenav_height) / 2 - iconPreviousHeight,
                left: 50,
            })
        }

        // Create TimeNav
        this._timenav = new TimeNav(this._el.timenav, this.config, this.options, this.language)
        this._timenav.on('loaded', this._onTimeNavLoaded, this)
        this._timenav.options.height = this.options.timenav_height
        this._timenav.init()

        // intial_zoom cannot be applied before the timenav has been created
        if (this.options.initial_zoom) {
            // at this point, this.options refers to the merged set of options
            this.setZoom(this.options.initial_zoom)
        }

        if (!this.options.headless) {
            // Create StorySlider
            this._storyslider = new StorySlider(this._el.storyslider, this.config, this.options, this.language)
            this._storyslider.on('loaded', this._onStorySliderLoaded, this)
            this._storyslider.init()
        }

        // Create Menu Bar
        this._menubar = new MenuBar(this._el.menubar, this._el.container, this.options)

        if (!this.options.headless) {
            // LAYOUT
            if (this.options.layout === 'portrait') {
                this.options.storyslider_height = (this.options.height - this.options.timenav_height - 1)
            } else {
                this.options.storyslider_height = (this.options.height - 1)
            }
        }

        // Update Display
        this._updateDisplay(this._timenav.options.height, true, 2000)

        if (this.options.headless) {
            this._updateNavText()
        }
    }

    /**
     * _initEvents() is a function that initializes the events for the TimeNav, StorySlider, and Menubar
     *
     * @private
     */
    _initEvents () {
        // TimeNav Events
        this._timenav.on('change', this._onTimeNavChange, this)
        this._timenav.on('zoomtoggle', this._onZoomToggle, this)

        if (!this.options.headless) {
            // StorySlider Events
            this._storyslider.on('change', this._onSlideChange, this)
            this._storyslider.on('colorchange', this._onColorChange, this)
            this._storyslider.on('nav_next', this._onStorySliderNext, this)
            this._storyslider.on('nav_previous', this._onStorySliderPrevious, this)
        } else {
            this._el.next.on('clicked', this._onNavigation, this)
            this._el.previous.on('clicked', this._onNavigation, this)
        }

        // Menubar Events
        this._menubar.on('zoom_in', this._onZoomIn, this)
        this._menubar.on('zoom_out', this._onZoomOut, this)
        this._menubar.on('back_to_start', this._onBackToStart, this)
    }

    _onColorChange (e) {
        this.fire('color_change', { unique_id: this.current_id }, this)
    }

    _onSlideChange (e) {
        if (this.current_id !== e.unique_id) {
            this.current_id = e.unique_id
            this._timenav.goToId(this.current_id)
            this._onChange(e)
        }
    }

    _onTimeNavChange (e) {
        if (this.current_id !== e.unique_id) {
            this.current_id = e.unique_id
            if (!this.options.headless) {
                this._storyslider.goToId(this.current_id)
            }
            this._onChange(e)
            this._updateNavText()
        }
    }

    _onZoomToggle (e) {
        if (e.zoom === 'in') {
            this._menubar.toogleZoomIn(e.show)
        } else if (e.zoom === 'out') {
            this._menubar.toogleZoomOut(e.show)
        }

    }

    _onChange () {
        this.fire('change', { unique_id: this.current_id }, this)
        if (this.options.hash_bookmark && this.current_id) {
            this._updateHashBookmark(this.current_id)
        }
    }

    _onBackToStart () {
        let i = this._getEventIndex(this.current_id)
        if (i !== 0) {
            if (!this.options.headless) {
                this._storyslider.goTo(0)
            } else {
                this.goToId(
                  this.config.title
                  ? this.config.title.unique_id
                  : this.config.events[0].unique_id,
                )
                this._updateNavText()
            }
            this.fire('back_to_start', { unique_id: this.current_id }, this)
        }
    }

    _onZoomIn (e) {
        this._timenav.zoomIn()
        this.fire('zoom_in', { zoom_level: this._timenav.options.scale_factor }, this)
    }

    _onZoomOut (e) {
        this._timenav.zoomOut()
        this.fire('zoom_out', { zoom_level: this._timenav.options.scale_factor }, this)
    }

    _onTimeNavLoaded () {
        this._loaded.timenav = true
        this._onLoaded()
    }

    _onStorySliderLoaded () {
        if (!this.options.headless) {
            this._loaded.storyslider = true
        }
        this._onLoaded()
    }

    _onStorySliderNext (e) {
        e.target.dispatchEvent(new CustomEvent('nav-next', {
            bubbles: true,
            detail: { event: this.config.events[this._getEventIndex(this.current_id) + 1] },
        }))
        this.fire('nav_next', e)
    }

    _onStorySliderPrevious (e) {
        e.target.dispatchEvent(new CustomEvent('nav-previous', {
            bubbles: true,
            detail: { event: this.config.events[this._getEventIndex(this.current_id) + 1] },
        }))
        this.fire('nav_previous', e)
    }

    _updateDisplay (timenav_height, animate, d) {
        let duration = this.options.duration,
          display_class = this.options.base_class,
          menu_position = 0

        if (d) {
            duration = d
        }

        // Update width and height
        this.options.width = this._el.container.offsetWidth
        this.options.height = this._el.container.offsetHeight

        // Check if skinny
        if (this.options.width <= this.options.skinny_size) {
            display_class += ' tl-skinny'
            this.options.layout = 'portrait'
        } else if (this.options.width <= this.options.medium_size) {
            display_class += ' tl-medium'
            this.options.layout = 'landscape'
        } else {
            this.options.layout = 'landscape'
        }

        // Detect Mobile and Update Orientation on Touch devices
        if (Browser.touch) {
            this.options.layout = Browser.orientation()
        }

        if (Browser.mobile) {
            display_class += ' tl-mobile'
            // Set TimeNav Height
            this.options.timenav_height = this._calculateTimeNavHeight(timenav_height, this.options.timenav_mobile_height_percentage)
        } else {
            // Set TimeNav Height
            this.options.timenav_height = this._calculateTimeNavHeight(timenav_height)
        }

        // LAYOUT
        if (this.options.layout === 'portrait') {
            // Portrait
            display_class += ' tl-layout-portrait'
        } else {
            // Landscape
            display_class += ' tl-layout-landscape'
        }

        if (!this.options.headless) {
            // Set StorySlider Height
            this.options.storyslider_height = (this.options.height - this.options.timenav_height)
        }

        // Positon Menu
        if (this.options.timenav_position === 'top') {
            menu_position = (Math.ceil(this.options.timenav_height) / 2) - (this._el.menubar.offsetHeight / 2) - (39 / 2)
        } else {
            menu_position = Math.round((this.options.storyslider_height || 0) + 1 + (Math.ceil(this.options.timenav_height) / 2) - (this._el.menubar.offsetHeight / 2) - (35 / 2))
        }

        if (animate) {
            this._el.timenav.style.height = Math.ceil(this.options.timenav_height) + 'px'

            if (!this.options.headless) {
                // Animate StorySlider
                if (this.animator_storyslider) {
                    this.animator_storyslider.stop()
                }
                this.animator_storyslider = Animate(this._el.storyslider, {
                    height: this.options.storyslider_height + 'px',
                    duration: duration / 2,
                    easing: easeOutStrong,
                })
            }

            // Animate Menubar
            if (this.animator_menubar) {
                this.animator_menubar.stop()
            }

            this.animator_menubar = Animate(this._el.menubar, {
                top: menu_position + 'px',
                duration: duration / 2,
                easing: easeOutStrong,
            })

        } else {
            // TimeNav
            this._el.timenav.style.height = Math.ceil(this.options.timenav_height) + 'px'

            if (!this.options.headless) {
                // StorySlider
                this._el.storyslider.style.height = this.options.storyslider_height + 'px'
            }

            // Menubar
            this._el.menubar.style.top = menu_position + 'px'
        }

        if (this.message) {
            this.message.updateDisplay(this.options.width, this.options.height)
        }
        // Update Component Displays
        this._timenav.updateDisplay(this.options.width, this.options.timenav_height, animate)
        if (!this.options.headless) {
            this._storyslider.updateDisplay(this.options.width, this.options.storyslider_height, animate, this.options.layout)
        }

        if (this.options.language.direction === 'rtl') {
            display_class += ' tl-rtl'
        }

        // Apply class
        this._el.container.className = display_class
    }

    /**
     * Compute the height of the navigation section of the Timeline, taking
     *     into account the possibility of an explicit height or height
     *     percentage, but also honoring the `timenav_height_min` option
     *     value. If `timenav_height` is specified it takes precedence over
     *     `timenav_height_percentage` but in either case, if the resultant
     *     pixel height is less than `options.timenav_height_min` then the
     *     value of `options.timenav_height_min` will be returned. (A minor
     *     adjustment is made to the returned value to account for marker
     *     padding.)
     *
     * @param {number} [timenav_height] - an integer value for the desired height in pixels
     * @param {number} [timenav_height_percentage] - an integer between 1 and 100
     * @private
     */
    _calculateTimeNavHeight (timenav_height, timenav_height_percentage) {
        let height = 0

        if (timenav_height) {
            height = timenav_height
        } else {
            if (this.options.timenav_height_percentage || timenav_height_percentage) {
                if (timenav_height_percentage) {
                    height = Math.round((this.options.height / 100) * timenav_height_percentage)
                } else {
                    height = Math.round((this.options.height / 100) * this.options.timenav_height_percentage)
                }

            }
        }

        // Set new minimum based on how many rows needed
        if (this._timenav.ready) {
            if (this.options.timenav_height_min < this._timenav.getMinimumHeight()) {
                this.options.timenav_height_min = this._timenav.getMinimumHeight()
            }
        }

        // If height is less than minimum set it to minimum
        if (height < this.options.timenav_height_min) {
            height = this.options.timenav_height_min
        }

        height = height - (this.options.marker_padding * 2)

        return height
    }

    /**
     * It checks to see if the options passed in are valid.
     *
     * @private
     */
    _validateOptions () {
        // assumes that this.options and this.config have been set.
        const INTEGER_PROPERTIES = [
            'timenav_height',
            'timenav_height_min',
            'marker_height_min', 'marker_width_min',
            'marker_padding',
            'start_at_slide',
            'slide_padding_lr',
        ]

        for (let i = 0; i < INTEGER_PROPERTIES.length; i++) {
            const opt = INTEGER_PROPERTIES[i]
            const value = this.options[opt]
            let valid = true
            if (typeof (value) == 'number') {
                valid = (value === parseInt(value))
            } else if (typeof (value) == 'string') {
                valid = (value.match(/^\s*(-?\d+)?\s*$/))
            }
            if (!valid) {
                this.config.logError({ message_key: 'invalid_integer_option', detail: opt })
            }
        }
    }

    /**
     * Given a slide identifier, return the zero-based positional index of
     * that slide. If this timeline has a 'title' slide, it is at position 0
     * and all other slides are numbered after that. If there is no 'title'
     * slide, then the first event slide is at position 0.
     *
     * @param {String} id
     * @private
     */
    _getSlideIndex (id) {
        if (this.config) {
            if (this.config.title && this.config.title.unique_id === id) {
                return 0
            }
            for (let i = 0; i < this.config.events.length; i++) {
                if (id === this.config.events[i].unique_id) {
                    return this.config.title ? i + 1 : i
                }
            }
        }
        return -1
    }

    /**
     * Given a slide identifier, return the zero-based positional index of that slide.
     * Does not take the existence of a 'title' slide into account, so if there is a title
     * slide, this value should be one less than calling `_getSlideIndex` with the same
     * identifier. If there is no title slide, `_getSlideIndex` and `_getEventIndex`
     * should return the same value.
     * TODO: does it really make sense to have both `_getSlideIndex` and `_getEventIndex`?
     *
     * @param {String} id
     * @private
     */
    _getEventIndex (id) {
        for (let i = 0; i < this.config.events.length; i++) {
            if (id === this.config.events[i].unique_id) {
                return i
            }
        }
        return -1
    }

    /**
     * Function called when the timeline is loaded.
     * It sets the first slide to be displayed.
     * If the hash_bookmark option is true:
     * - if a hash is in URL display the slide with the matching ID
     * - if no hash is in URL, display the first slide and set the hash
     *
     * @private
     */
    _onLoaded () {
        if ((this._loaded.storyslider || this.options.headless) && this._loaded.timenav) {
            this.fire('loaded', this.config)
            // Go to proper slide
            if (isTrue(this.options.start_at_end) || this.options.start_at_slide > this.config.events.length) {
                this.goToEnd()
            } else {
                this.goTo(this.options.start_at_slide)
            }
            if (this.options.hash_bookmark) {
                if (window.location.hash !== '') {
                    this.goToId(window.location.hash.replace('#event-', ''))
                } else {
                    this._updateHashBookmark(this.current_id)
                }
                let the_timeline = this
                window.addEventListener('hashchange', function () {
                    if (window.location.hash.indexOf('#event-') === 0) {
                        the_timeline.goToId(window.location.hash.replace('#event-', ''))
                    }
                }, false)
            }

        }
    }

    /**
     * Update hash bookmark in the url bar.
     *
     * @param {string} id
     * @private
     */
    _updateHashBookmark (id) {
        if (id) { // TODO: validate the id...
            const hash = '#' + 'event-' + id.toString()
            window.history.replaceState(null, 'Browsing TimelineJS', hash)
            this.fire('hash_updated', {
                unique_id: this.current_id,
                hashbookmark: '#' + 'event-' + id.toString(),
            }, this)
        }
    }

    /**
     * Update the text and the date of the nav button.
     *
     * @private
     */
    _updateNavText () {
        if (this.options.headless) {
            let id = this.config.title ? this._getSlideIndex(this.current_id) : this._getSlideIndex(this.current_id) + 1
            if (id >= this.config.events.length) {
                this._el.next.hide()
            } else {
                this._el.next.show()
                this._el.next.update(
                  new Slide(
                    this.config.events[id],
                    this.options,
                    false,
                    this.getLanguage(),
                  ),
                )
            }

            id = this.config.title ? this._getSlideIndex(this.current_id) - 2 : this._getSlideIndex(this.current_id) - 1
            if (id < 0) {
                this._el.previous.hide()
            } else {
                this._el.previous.show()
                this._el.previous.update(
                  new Slide(
                    this.config.events[id],
                    this.options,
                    false,
                    this.getLanguage(),
                  ),
                )
            }
        }
    }

    _onNavigation (e) {
        if (e.direction === 'next' || e.direction === 'left') {
            this.goToNext()
        } else if (e.direction === 'previous' || e.direction === 'right') {
            this.goToPrev()
        }

        this._updateNavText()

        this.fire('nav_' + e.direction, this.data)
    }

    /*
        PUBLIC API
        This has been minimally tested since most people use TimelineJS as an embed.
        If we hear from people who are trying to use TimelineJS this way, we will do
        what we can to make sure it works correctly, and will appreciate help!
    */
    zoomIn () {
        this._timenav.zoomIn()
    }

    zoomOut () {
        this._timenav.zoomOut()
    }

    setZoom (level) {
        this._timenav.setZoom(level)
    }

    /**
     * Goto slide with id
     *
     * @param {string} id
     */
    goToId (id) {
        if (this.current_id !== id) {
            this.current_id = id
            this._timenav.goToId(this.current_id)

            if (!this.options.headless) {
                this._storyslider.goToId(this.current_id, false, true)
            }
            this.fire('change', { unique_id: this.current_id }, this)
        }
    }

    /**
     * Goto slide n
     *
     * @param {number} n
     */
    goTo (n) {
        if (this.config.title) {
            if (n === 0) {
                this.goToId(this.config.title.unique_id)
            } else {
                this.goToId(this.config.events[n - 1].unique_id)
            }
        } else {
            if (n >= 0 && n < this.config.events.length) {
                this.goToId(this.config.events[n].unique_id)
            }
        }
    }

    /**
     * Goto first slide
     */
    goToStart () {
        this.goTo(0)
    }

    /**
     * Goto last slide
     */
    goToEnd () {
        const _n = this.config.events.length - 1
        this.goTo(this.config.title ? _n + 1 : _n)
    }

    /**
     * Goto previous slide
     */
    goToPrev () {
        this.goTo(this._getSlideIndex(this.current_id) - 1)
    }

    /**
     * Goto next slide
     */
    goToNext () {
        this.goTo(this._getSlideIndex(this.current_id) + 1)
    }

    /* Event manipulation
    ================================================== */

    /**
     * Add an event
     *
     * @param data
     */
    add (data) {
        const unique_id = this.config.addEvent(data)

        const n = this._getEventIndex(unique_id)
        const d = this.config.events[n]

        if (!this.options.headless) {
            this._storyslider.createSlide(d, this.config.title ? n + 1 : n)
            this._storyslider._updateDrawSlides()
        }

        this._timenav.createMarker(d, n)
        this._timenav._updateDrawTimeline(false)

        this.fire('added', { unique_id: unique_id })
    }

    /**
     * Remove an event
     *
     * @param n
     */
    remove (n) {
        if (n >= 0 && n < this.config.events.length) {
            // If removing the current, nav to new one first
            if (this.config.events[n].unique_id === this.current_id) {
                if (n < this.config.events.length - 1) {
                    this.goTo(n + 1)
                } else {
                    this.goTo(n - 1)
                }
            }

            const event = this.config.events.splice(n, 1)
            delete this.config.event_dict[event[0].unique_id]

            if (!this.options.headless) {
                this._storyslider.destroySlide(this.config.title ? n + 1 : n)
                this._storyslider._updateDrawSlides()
            }

            this._timenav.destroyMarker(n)
            this._timenav._updateDrawTimeline(false)

            this.fire('removed', { unique_id: event[0].unique_id })
        }
    }

    removeId (id) {
        this.remove(this._getEventIndex(id))
    }

    /* Get slide data
    ================================================== */

    getData (n) {
        if (this.config.title) {
            if (n === 0) {
                return this.config.title
            } else if (n > 0 && n <= this.config.events.length) {
                return this.config.events[n - 1]
            }
        } else if (n >= 0 && n < this.config.events.length) {
            return this.config.events[n]
        }
        return null
    }

    getDataById (id) {
        return this.getData(this._getSlideIndex(id))
    }

    /* Get slide object
    ================================================== */

    getSlide (n) {
        if (this._storyslider && n >= 0 && n < this._storyslider._slides.length) {
            return this._storyslider._slides[n]
        }
        return null
    }

    getSlideById (id) {
        return this.getSlide(this._getSlideIndex(id))
    }

    getCurrentSlide () {
        return this.getSlideById(this.current_id)
    }

    updateDisplay () {
        if (this.ready) {
            this._updateDisplay()
        } else {
            trace('updateDisplay called but timeline is not in ready state')
        }
    }

    _initGoogleAnalytics () {
        (function (i, s, o, g, r, a, m) {
            i['GoogleAnalyticsObject'] = r
            i[r] = i[r] || function () {
                (i[r].q = i[r].q || []).push(arguments)
            }, i[r].l = 1 * new Date()
            a = s.createElement(o), m = s.getElementsByTagName(o)[0]
            a.async = 1
            a.src = g
            m.parentNode.insertBefore(a, m)
        })(window, document, 'script', '//www.google-analytics.com/analytics.js', 'ga')

        ga('create', this.options.ga_property_id, 'auto')
        ga('set', 'anonymizeIp', true)
    }

    _initAnalytics () {
        if (this.options.ga_property_id === null) { return }
        this._initGoogleAnalytics()
        ga('send', 'pageview')
        const events = this.options.track_events
        for (let i = 0; i < events.length; i++) {
            const event_ = events[i]
            this.addEventListener(event_, function (e) {
                ga('send', 'event', e.type, 'clicked')
            })
        }
    }

}

classMixin(Timeline, I18NMixins, Events)

export { Timeline }
