import {vector} from '../vector.js';


function createSvgElem(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}

export var PolyArrow = L.Layer.extend({

    options: {
          color: 'red'
        , text: ''
        , width: 150
        , arrowLength: 200
        , arrowBaseSize: 300
        , strokeWidth: 10
        , minStrokeWidth: 4
        , defaultZoom: 0
        , opacity: 0.6
        , padding: 0.1
        , pane: 'overlayPane'
    },

    initialize: function (latLngs, options) {
        L.Util.setOptions(this, options);
        L.Util.stamp(this);
        this.setLatLngs(latLngs);
    },

    setLatLngs: function (latLngs) {
        this._latLngs = latLngs.map((x) => new L.latLng(x));
    },
    
    getLatLngs: function () {
        return Array.from(this._latLngs);
    },

    setText: function (text) {
        this.options.text = text;
        this._reset();
    },

    getText: function () {
        return this.options.text;
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
        this._pathElem = createSvgElem('path');
        L.DomUtil.addClass(this._pathElem, 'leaflet-interactive');

        this._gElem.appendChild(this._pathElem);
        this._svgElem.appendChild(this._gElem);

        const pane = map.getPane(this.options.pane);
        pane.appendChild(this._svgElem);
        this._reset();
    },

    onRemove: function () {
        L.DomUtil.remove(this._svgElem);
        L.DomEvent.off(this._svgElem);
        delete this._svgElem;
        delete this._gElem;
        delete this._pathElem;
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
            this._updatePath();
        }
    },

    _getZoomScaling() {
        return Math.pow(2, this._zoom - this.options.defaultZoom);
    },

    _updatePath: function () {
            const pathText = this._makePath();
            const zoomScaling = this._getZoomScaling();

            this._pathElem.setAttribute('d', pathText);
            this._pathElem.setAttribute('stroke', this.options.color);
            this._pathElem.setAttribute('stroke-opacity', this.options.opacity);
            this._pathElem.setAttribute('stroke-width', Math.max(this.options.minStrokeWidth, this.options.strokeWidth * zoomScaling));
            this._pathElem.setAttribute('fill', 'transparent'); // 'transparent' ensures interactivity on the body itself

            // Remove old text elements from gElem
            const textElems = this._gElem.querySelectorAll('text');
            Array.from(textElems).forEach((tElem) => this._gElem.removeChild(tElem));
            if (this.options.text && this.options.text !== '') {
                this._getTextElements().forEach((elem) => this._gElem.appendChild(elem));
            }
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
    },

    _getLayerPoints: function () {
        const points = this._latLngs.map((p) => {
            const leafPoint = this._map.latLngToLayerPoint(p).round();
            return vector(leafPoint.x, leafPoint.y);
        });
        return points;
    },

    _computeOffsetLine: function (offset) {
        // We first convert all points to layer space, and vector objects
        const points = this._getLayerPoints();
        offset = offset || 0;
        if (points.length == 2) {
            const from = points[0];
            const to = points[1];
            const fromTo = to.copy().sub(from);
            const vecOffset = fromTo.copy().perpendicular().norm().scale(offset);
            from.add(vecOffset);
            to.add(vecOffset);
            return [from, to];
        } else {
            raise("Not implemented yet...");
        }
    },

    _computeArrowhead: function () {
        // Construct this facing right on unit circle with the tip at (0,0).
        const scaling = this._getZoomScaling();
        const arrowLength = this.options.arrowLength * scaling;
        const arrowWidth = this.options.arrowBaseSize * scaling;
        const turnAngle = 90;
        const result = [];
        // Right base
        result.push(vector(-arrowLength, 0).add(vector(arrowWidth / 2, 0).rotateDeg(-turnAngle)));
        // Tip
        result.push(vector(0, 0));
        // Left base
        result.push(vector(-arrowLength, 0).add(vector(arrowWidth / 2, 0).rotateDeg(turnAngle)));
        return result;
    },

    _shortenPolyline: function (lines, amount) {
        // TODO: improve this if the last segments are actually too short
        const numLines = lines.length;
        const [sndLast, last] = lines.slice(numLines-2, numLines);
        const vecDir = last.copy().sub(sndLast).norm();
        // In place modification
        last.add(vecDir.negate().scale(amount));
        return lines;
    },

    _computePath: function () {
        const scaling = this._getZoomScaling();
        const halfWidth = this.options.width / 2 * scaling;
        const arrowHeadLength = this.options.arrowLength * scaling;
        const rightForward = this._shortenPolyline(this._computeOffsetLine(-halfWidth), arrowHeadLength);
        const leftBackwards = this._shortenPolyline(this._computeOffsetLine(halfWidth), arrowHeadLength).reverse();

        const [sndLastPt, lastPt] = this._latLngs.slice(this._latLngs.length-2, this._latLngs.length).map((p) => {
            const leafPoint = this._map.latLngToLayerPoint(p).round();
            return vector(leafPoint.x, leafPoint.y);
        });
        const lastDir = -lastPt.copy().sub(sndLastPt).angleDeg();
        const arrowPart = this._computeArrowhead();
        const arrowPoints = arrowPart.map((p) => p.copy().rotateDeg(-lastDir).add(lastPt));

        const result = rightForward.concat(arrowPoints, leftBackwards);
        return result;
    },

    _hackMeasureSvgTextWidth: function (fontSize, text) {
        if (!this._cachedTextWidth) {
            this._cachedTextWidth = {fontSize: -1, text: '', width: -1};
        }
        const cached = this._cachedTextWidth;

        if (cached.fontSize === fontSize && cached.text === text) {
            return cached.width;
        }

        const svg = createSvgElem('svg');
        const textElem = createSvgElem('text');
        textElem.setAttribute('font-size', fontSize);
        textElem.setAttribute('text-anchor', 'middle');
        textElem.textContent = text;
        svg.appendChild(textElem);
        document.body.appendChild(svg);
        const bbox = textElem.getBBox();
        document.body.removeChild(svg);

        cached.fontSize = fontSize;
        cached.text = text;
        const result = cached.width = bbox.width;
        return result;
    },

    _getTextElements: function () {
        const layerPoints = this._getLayerPoints();
        const textElems = [];
        const scaling = this._getZoomScaling();
        const fontSize = (this.options.width - this.options.strokeWidth * 4) * scaling;
        const edgeOffset = fontSize * 0.37;
        const text = this.options.text;

        if (fontSize < 18) return textElems;
        const textWidth = this._hackMeasureSvgTextWidth(fontSize, text);

        for (let i=0; i < layerPoints.length-1; ++i) {
            const from = layerPoints[i];
            const to = layerPoints[i+1];
            const fromTo = to.copy().sub(from);
            // Remove arrowhead length for text element purposes
            fromTo.sub(fromTo.copy().norm().scale(this.options.arrowLength * scaling));

            const pixDist = fromTo.magnitude();
            const lastDir = fromTo.angleDeg();
            const centerOffset = vector(0, 1).rotateDeg(lastDir).scale(edgeOffset);

            // We always want to read left to right, so keep it in -90 to +90 range
            let textRotate = lastDir;
            if (fromTo.x < 0) {
                textRotate = (textRotate + 180 % 360);
                centerOffset.negate();
            }

            let intervalPositions = [];
            const textPadding = Math.max(textWidth * 0, 2 * fontSize);
            const availableWidth = pixDist - textPadding * 2;
            const numTexts = Math.floor(availableWidth / (textWidth + textPadding));
            const intervalPadding = (textPadding + textWidth / 2) / pixDist;
            const intervalFill = 1 - 2 * intervalPadding;
            // Evenly distribute
            if (numTexts > 1) {
                for (let i=0; i < numTexts; ++i) {
                    intervalPositions.push(intervalPadding + (i / (numTexts-1) * intervalFill));
                }
            } else {
                // At least 1
                intervalPositions = [intervalPadding + intervalFill / 2];
            }

            intervalPositions.forEach((d) => {
                const center = from.copy().add(fromTo.copy().scale(d)).add(centerOffset);
                const elem = createSvgElem('text');
                elem.setAttribute('text-anchor', 'middle');
                elem.setAttribute('fill', this.options.color);
                elem.setAttribute('font-size', fontSize);
                elem.setAttribute('transform', `rotate(${textRotate}, ${center.x},${center.y})`);
                elem.setAttribute('x', center.x);
                elem.setAttribute('y', center.y);
                elem.textContent = text;
                textElems.push(elem);
            });
        };
        return textElems;
    },

    _makePath: function() {
        if (this._latLngs.length < 2) {
            return '';
        }

        const points = this._computePath();
        const pathText = 'M' + points.map((p) => p.x + ' ' + p.y).join('L') + 'Z';
        return pathText;
    }
});
