import { classMixin, mergeData, unlinkify } from '../core/Util'
import Events from '../core/Events'
import { DOMMixins } from '../dom/DOMMixins'
import { DOMEvent } from '../dom/DOMEvent'

import { addClass, removeClass } from '../dom/DOMUtil'
import * as DOM from '../dom/DOM'
import { webkit as BROWSER_WEBKIT } from '../core/Browser'
import { easeInSpline } from '../animation/Ease'

import { lookupMediaType } from '../media/MediaType'

export class TimeMarker {
    constructor (data, options) {
        // DOM Elements
        this._el = {
            container: {},
            content_container: {},
            media_container: {},
            timespan: {},
            line_left: {},
            line_right: {},
            content: {},
            text: {},
            media: {},
        }

        // Components
        this._text = {}

        // State
        this._state = {
            loaded: false,
        }

        // Data
        this.data = {
            unique_id: '',
            background: null,
            date: {
                year: 0,
                month: 0,
                day: 0,
                hour: 0,
                minute: 0,
                second: 0,
                millisecond: 0,
                thumbnail: '',
                format: '',
            },
            text: {
                headline: '',
                text: '',
            },
            media: null,
        }

        this.isTodayEvent = false

        if (!!data.end_date && !!data.end_date.data && data.end_date.data.today) {
            const today = new Date()
            delete data.end_date.data.today
            data.end_date.data = {
                format: 'full',
                format_short: 'full_short',
                day: today.getDate(),
                month: today.getMonth() + 1,
                year: today.getFullYear(),
                date_obj: today,
                is_today: true,
            }

            this.isTodayEvent = true
        }

        // Options
        this.options = {
            duration: 1000,
            ease: easeInSpline,
            width: 600,
            height: 600,
            marker_width_min: 100, 			// Minimum Marker Width
        }

        // Actively Displaying
        this.active = false

        // Animation Object
        this.animator = {}

        // End date
        this.has_end_date = false

        // Merge Data and Options
        mergeData(this.options, options)
        mergeData(this.data, data)

        this._initLayout()
        this._initEvents()
    }

    /*	Adding, Hiding, Showing etc
    ================================================== */
    show () {

    }

    hide () {

    }

    setActive (is_active) {
        this.active = is_active

        if (this.active && this.has_end_date) {
            this._el.container.className = 'tl-timemarker tl-timemarker-with-end tl-timemarker-active'
        } else if (this.active) {
            this._el.container.className = 'tl-timemarker tl-timemarker-active'
        } else if (this.has_end_date) {
            this._el.container.className = 'tl-timemarker tl-timemarker-with-end'
        } else {
            this._el.container.className = 'tl-timemarker'
        }
    }

    addTo (container) {
        container.appendChild(this._el.container)
    }

    removeFrom (container) {
        container.removeChild(this._el.container)
    }

    updateDisplay (w, h) {
        this._updateDisplay(w, h)
    }

    loadMedia () {

        if (this._media && !this._state.loaded) {
            this._media.loadMedia()
            this._state.loaded = true
        }
    }

    stopMedia () {
        if (this._media && this._state.loaded) {
            this._media.stopMedia()
        }
    }

    getLeft () {
        return this._el.container.style.left.slice(0, -2)
    }

    getTime () {
        return this.data.start_date.getTime()
    }

    getEndTime () {

        if (this.data.end_date) {
            return this.data.end_date.getTime()
        } else {
            return false
        }
    }

    setHeight (h) {
        let text_line_height = 12,
          text_lines = 1

        this._el.content_container.style.height = h + 'px'
        this._el.timespan_content.style.height = h + 'px'
        // Handle Line height for better display of text
        if (h <= 30) {
            this._el.content.className = 'tl-timemarker-content tl-timemarker-content-small'
        } else {
            this._el.content.className = 'tl-timemarker-content'
        }

        if (h <= 56) {
            addClass(this._el.content_container, 'tl-timemarker-content-container-small')
        } else {
            removeClass(this._el.content_container, 'tl-timemarker-content-container-small')
        }

        // Handle number of lines visible vertically

        if (BROWSER_WEBKIT) {
            text_lines = Math.floor(h / (text_line_height + 2))
            if (text_lines < 1) {
                text_lines = 1
            }
            this._text.className = 'tl-headline'
            this._text.style.webkitLineClamp = text_lines
        } else {
            text_lines = h / text_line_height
            if (text_lines > 1) {
                this._text.className = 'tl-headline tl-headline-fadeout'
            } else {
                this._text.className = 'tl-headline'
            }
            this._text.style.height = (text_lines * text_line_height) + 'px'
        }
    }

    setWidth (w) {
        if (this.data.end_date) {
            this._el.container.style.width = w + 'px'

            if (w > this.options.marker_width_min) {
                this._el.content_container.style.width = w + 'px'
                this._el.content_container.className = 'tl-timemarker-content-container tl-timemarker-content-container-long'
            } else {
                this._el.content_container.style.width = this.options.marker_width_min + 'px'
                this._el.content_container.className = 'tl-timemarker-content-container'
            }

            if (this.isTodayEvent) {
                this._el.content_container.className += ' tl-timemarker-content-today'
            }
        }
    }

    setClass (n) {
        this._el.container.className = n
    }

    setRowPosition (n, remainder) {
        this.setPosition({ top: n })
        this._el.timespan.style.height = remainder + 'px'
    }

    /*	Events
    ================================================== */
    _onMarkerClick (e) {
        this.fire('markerclick', { unique_id: this.data.unique_id })
    }

    /*	Private Methods
    ================================================== */
    _initLayout () {
        // Create Layout
        this._el.container = DOM.create('div', 'tl-timemarker')
        if (this.data.unique_id) {
            this._el.container.id = this.data.unique_id + '-marker'
        }

        if (this.data.end_date) {
            this.has_end_date = true
            this._el.container.className = 'tl-timemarker tl-timemarker-with-end'
        }

        this._el.timespan = DOM.create('div', 'tl-timemarker-timespan', this._el.container)
        this._el.timespan_content = DOM.create('div', 'tl-timemarker-timespan-content', this._el.timespan)
        this._el.content_container = DOM.create('div', 'tl-timemarker-content-container', this._el.container)

        if (this.isTodayEvent) {
            this._el.timespan_content.className += ' tl-timemarker-timespan-content-today'
        }

        /**
         * Dispatch custom event to listen the click event on the marker
         */
        if (this.options.headless) {
            this._el.content_container.addEventListener('click', (e) => {
                e.target.dispatchEvent(new CustomEvent('event-click', {
                    bubbles: true,
                    detail: { event: this.data },
                }))
            })
        }

        this._el.content = DOM.create('div', 'tl-timemarker-content', this._el.content_container)

        this._el.line_left = DOM.create('div', 'tl-timemarker-line-left', this._el.timespan)
        this._el.line_right = DOM.create('div', 'tl-timemarker-line-right', this._el.timespan)

        // Thumbnail or Icon
        if (this.data.media) {
            this._el.media_container = DOM.create('div', 'tl-timemarker-media-container', this._el.content)
            // ugh. needs an overhaul
            let mtd = { url: this.data.media.thumbnail }
            let thumbnail_media_type = (this.data.media.thumbnail) ? lookupMediaType(mtd, true) : null
            if (thumbnail_media_type) {
                let thumbnail_media = new thumbnail_media_type.cls(mtd)
                thumbnail_media.on('loaded', function () {
                    this._el.media = DOM.create('img', 'tl-timemarker-media', this._el.media_container)
                    this._el.media.src = thumbnail_media.getImageURL()
                }.bind(this))
                thumbnail_media.loadMedia()
            } else {
                let media_type = lookupMediaType(this.data.media).type
                this._el.media = DOM.create('span', 'tl-icon-' + media_type, this._el.media_container)
            }

        }

        // Text
        this._el.text = DOM.create('div', 'tl-timemarker-text', this._el.content)
        this._text = DOM.create('h2', 'tl-headline', this._el.text)
        if (this.data.text.headline && this.data.text.headline !== '') {
            this._text.innerHTML = unlinkify(this.data.text.headline)
        } else if (this.data.text.text && this.data.text.text !== '') {
            this._text.innerHTML = unlinkify(this.data.text.text)
        } else if (this.data.media && this.data.media.caption && this.data.media.caption !== '') {
            this._text.innerHTML = unlinkify(this.data.media.caption)
        }

        // Fire event that the slide is loaded
        this.onLoaded()
    }

    _initEvents () {
        DOMEvent.addListener(this._el.container, 'click', this._onMarkerClick, this)
    }

    // Update Display
    _updateDisplay (width, height, layout) {

        if (width) {
            this.options.width = width
        }

        if (height) {
            this.options.height = height
        }

    }

}

classMixin(TimeMarker, Events, DOMMixins)
