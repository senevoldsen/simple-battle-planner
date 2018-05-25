

export function createSvgElem(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}

export var SvgMarker = L.Layer.extend({

    options: {
          defaultZoom: 0
        , padding: 0.1
        , pane: 'overlayPane'
    },

    initialize: function (options) {
        L.Util.setOptions(this, options);
        L.Util.stamp(this);
    },

    onAdd: function (map) {
        if (!this._svgElem) {
            this._svgElem = createSvgElem('svg');
            this._svgElem.setAttribute('pointer-events', 'none');
            if (this._zoomAnimated) {
                L.DomUtil.addClass(this._svgElem, 'leaflet-zoom-animated');
            }    
        }
        
        this._gElem = createSvgElem('g');
        this._svgElem.appendChild(this._gElem);

        const pane = map.getPane(this.options.pane);
        pane.appendChild(this._svgElem);
    },

    onRemove: function () {
        L.DomUtil.remove(this._svgElem);
        L.DomEvent.off(this._svgElem);
        delete this._svgElem;
        delete this._gElem;
    },

    getEvents: function () {
        const events = {
              viewreset: this._onViewReset
            , zoom: this._onZoom
            , moveend: this._onMoveEnd
            , zoomend: this._onZoomEnd
        };
        if (this._zoomAnimated) {
            events.zoomanim = this._onZoomAnim;
        }
        return events;
    },


    _onViewReset: function () {
        this._reset();
        this._updateTransform();
    },

    _onZoom: function () {
        this._updateTransform();
    },

    _onMoveEnd: function () {
        this._reset();
        this._updateTransform();
    },

    _onZoomEnd: function () {
        this._reset();
        this._updateTransform();
    },

    _onZoomAnim: function (e) {
        this._updateTransform(e.center, e.zoom);
    },

    /*
        Updates the SVG containers width, and stores the current bounds, center and zoom.
    */
    _reset: function () {
        if (this._map) {
            if (this._map._animatingZoom && this._bounds) { return; }
            // Update bounds
            var p = this.options.padding,
                size = this._map.getSize(),
                min = this._map.containerPointToLayerPoint(size.multiplyBy(-p)).round();
            
            this._bounds = new L.Bounds(min, min.add(size.multiplyBy(1 + p * 2)).round());
            this._center = this._map.getCenter();
            this._zoom = this._map.getZoom();

            var b = this._bounds,
                size = b.getSize(),
                container = this._svgElem;

            // set size of svg-container if changed
            if (!this._svgSize || !this._svgSize.equals(size)) {
                this._svgSize = size;
                container.setAttribute('width', size.x);
                container.setAttribute('height', size.y);
            }

            // movement: update container viewBox so that we don't have to change coordinates of individual layers
            L.DomUtil.setPosition(container, b.min);
            container.setAttribute('viewBox', [b.min.x, b.min.y, size.x, size.y].join(' '));

            // Update path attributes
            this._update();
        }
    },

    _getZoomScaling() {
        return Math.pow(2, this._zoom - this.options.defaultZoom);
    },

    _update: function () {
        throw Error('Must be implemented in subclass');
    },

    /*
        Only updates the SVG transform matrix to place things properly
    */
    _updateTransform: function (center, zoom) {
        if (center === undefined) center = this._center;
        if (zoom === undefined) zoom = this._zoom;
        var scale = this._map.getZoomScale(zoom, this._zoom),
            position = L.DomUtil.getPosition(this._svgElem),
            viewHalf = this._map.getSize().multiplyBy(0.5 + this.options.padding),
            currentCenterPoint = this._map.project(this._center, zoom),
            destCenterPoint = this._map.project(center, zoom),
            centerOffset = destCenterPoint.subtract(currentCenterPoint),
            topLeftOffset = viewHalf.multiplyBy(-scale).add(position).add(viewHalf).subtract(centerOffset);

        if (L.Browser.any3d) {
            L.DomUtil.setTransform(this._svgElem, topLeftOffset, scale);
        } else {
            L.DomUtil.setPosition(this._svgElem, topLeftOffset);
        }
    }
});