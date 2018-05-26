import {vector} from '../vector.js';
import * as leafSVG from './svg-marker.js';

export var PolyArrow = leafSVG.SvgMarker.extend({

    options: {
          color: 'red'
        , text: ''
        , width: 150
        , arrowLength: 200
        , arrowBaseSize: 300
        , strokeWidth: 20
        , minStrokeWidth: 4
        , defaultZoom: 0
        , opacity: 0.6
        , padding: 0.1
        , pane: 'overlayPane'
    },

    initialize: function (latLngs, options) {
        leafSVG.SvgMarker.prototype.initialize.call(this, options);
        L.Util.setOptions(this, options);
        L.Util.stamp(this);
        this.setLatLngs(latLngs);
    },

    setLatLngs: function (latLngs) {
        this._latLngs = latLngs.map((x) => new L.latLng(x));
        if (this._map) {
            this._reset();
            this._updateTransform();    
        }
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
        leafSVG.SvgMarker.prototype.onAdd.call(this, map);
        this._pathElem = leafSVG.createSvgElem('path');        
        this._gElem.appendChild(this._pathElem);
        this._reset();

        this.on('contextmenu', (e) => {
            const numPoints = this._latLngs.length;
            if (numPoints == 0) return;
            // Extend event
            e.polyArrow = this;
            e.polyArrowEndPos = this._latLngs[numPoints-1];
            L.DomEvent.stop(e);
            this.fire('arrow-contextmenu', e);
        }); 
    },

    onRemove: function () {
        leafSVG.SvgMarker.prototype.onRemove.call(this);
        delete this._pathElem;
    },

    _update: function () {
        const pathText = this._makeMovePath();

        this._pathElem.setAttribute('d', pathText);
        this._pathElem.setAttribute('stroke', this.options.color);
        this._pathElem.setAttribute('stroke-opacity', this.options.opacity);
        this._pathElem.setAttribute('stroke-width', this._getStrokeWidth());
        this._pathElem.setAttribute('fill', 'none');

        // Remove old text elements from gElem
        const textElems = this._gElem.querySelectorAll('text');
        Array.from(textElems).forEach((tElem) => this._gElem.removeChild(tElem));
        if (this.options.text && this.options.text !== '') {
            this._getTextElements().forEach((elem) => this._gElem.appendChild(elem));
        }

        // Add interact area
        // -- Remove previous interact area
        Array.from(this._gElem.querySelectorAll('.bp-movesegment-interact-arrow')).forEach((elem) => {
            this._gElem.removeChild(elem);
            this.removeInteractiveTarget(elem);
        });
        if (this.listens('arrow-contextmenu') || true) {
            const interactElem = this._makeInteractElem();
            if (interactElem) {
                this._gElem.appendChild(interactElem);    
                this.addInteractiveTarget(interactElem);
            }
        }
    },

    _getStrokeWidth: function () {
        const scaling = this._getZoomScaling();
        return Math.max(this.options.minStrokeWidth, this.options.strokeWidth * scaling);
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

    _computeArrowhead: function (length, baseSize) {
        // Construct this facing right on unit circle with the tip at (0,0).
        const scaling = this._getZoomScaling();
        const arrowLength = length * scaling;
        const arrowWidth = baseSize * scaling;
        const turnAngle = 90;
        const result = [];
        // Right base
        result.push(vector(-arrowLength, 0).add(vector(arrowWidth / 2, 0).rotateDeg(-turnAngle)));
        // Tip
        result.push(vector(-this.options.strokeWidth * scaling, 0));
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
        const arrowPart = this._computeArrowhead(this.options.arrowLength, this.options.arrowBaseSize);
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

        const svg = leafSVG.createSvgElem('svg');
        const textElem = leafSVG.createSvgElem('text');
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
        // Do not use dynamic stroke width here since that will keep adjusting offset when zooming.
        const fontSize = (this.options.width - this.options.strokeWidth * 4) * scaling;
        const edgeOffset = fontSize * 0.37;
        const text = this.options.text;

        if (fontSize < 13) return textElems;
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
                const elem = leafSVG.createSvgElem('text');
                elem.setAttribute('text-anchor', 'middle');
                elem.setAttribute('fill', this.options.color);
                elem.setAttribute('fill-opacity', this.options.opacity);
                elem.setAttribute('font-size', fontSize);
                elem.setAttribute('font-weight', 'bold');
                elem.setAttribute('transform', `rotate(${textRotate}, ${center.x},${center.y})`);
                elem.setAttribute('x', center.x);
                elem.setAttribute('y', center.y);
                elem.textContent = text;
                textElems.push(elem);
            });
        };
        return textElems;
    },

    _makeInteractElem: function () {
        // Only add if it would have decent size
        let result = null;
        const scaling = this._getZoomScaling();
        const arrowLength = this.options.arrowLength;
        const arrowBaseSize = this.options.arrowBaseSize;
        const arrowArea = arrowLength * scaling * arrowBaseSize * scaling / 2;
        if (arrowArea > 100) {
            const allPoints = this._getLayerPoints();
            const lastPoint = allPoints[allPoints.length-1];
            const sndLastPoint = allPoints[allPoints.length-2];
            const lastDir = lastPoint.copy().sub(sndLastPoint).angleDeg();
            const arrowAtOrigin = this._computeArrowhead(arrowLength, arrowBaseSize);
            const arrowInLayer = arrowAtOrigin.map((p) => p.rotateDeg(lastDir).add(lastPoint));
            const arrowPathText = 'M' + arrowInLayer.map((p) => p.x + ' ' + p.y).join('L') + 'Z';
            const arrowPath = leafSVG.createSvgElem('path');
            arrowPath.setAttribute('d', arrowPathText);
            arrowPath.setAttribute('fill', 'transparent');
            L.DomUtil.addClass(arrowPath, 'leaflet-interactive');
            L.DomUtil.addClass(arrowPath, 'bp-leaflet-interactive');
            L.DomUtil.addClass(arrowPath, 'bp-movesegment-interact-arrow');
            result = arrowPath;
        }
        return result;
    },

    _makeMovePath: function() {
        if (this._latLngs.length < 2) {
            return '';
        }

        const points = this._computePath();
        const pathText = 'M' + points.map((p) => p.x + ' ' + p.y).join('L') + 'Z';
        return pathText;
    }
});
