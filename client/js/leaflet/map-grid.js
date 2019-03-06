import * as leafSVG from './svg-marker.js';

export var MapGrid = leafSVG.SvgMarker.extend({

    options: {
          bpMap: null
        , gridSize: 1000 // Grid size in meters
        
        , increaseRight: true
        , increaseUp: true

        , strokeColor: 'black'
        , opacity: 0.8
        , defaultZoom: 0
        , strokeWidth: 3
        , minStrokeWidth: 1
        , pane: 'overlayPane'
    },

    initialize: function (options) {
        leafSVG.SvgMarker.prototype.initialize.call(this, options);
        L.Util.setOptions(this, options);
    },

    onAdd: function (map) {
        leafSVG.SvgMarker.prototype.onAdd.call(this, map);
        this._reset();
    },

    onRemove: function () {
        leafSVG.SvgMarker.prototype.onRemove.call(this);
        // TODO: remove any current path elems
    },

    setBPMap: function (bpMap) {
        this.options.bpMap = bpMap;
    },

    _update: function () {
        const bpMap = this.options.bpMap;
        this._removeGrid();
        if (bpMap == null) {
            return;
        }

        const [mcLLX, mcLLY] = bpMap.constants.lowerLeftPos;
        const [mcURX, mcURY] = bpMap.constants.upperRightPos;
        const delta = this.options.gridSize;

        const strokeColor = this.options.strokeColor;
        const strokeWidth = this.options.strokeWidth;
        const strokeOpacity = this.options.opacity;
        // const halfStrokeWidth = strokeWidth / 2;
        const halfStrokeWidth = 0;
        const gameToLayer = p => this._map.latLngToLayerPoint(bpMap.gameToMap(p));
        const makeLine = (from, to) => {
            const line = leafSVG.createSvgElem('line');
            line.setAttribute('x1', from[0]);
            line.setAttribute('y1', from[1]);
            line.setAttribute('x2', to[0]);
            line.setAttribute('y2', to[1]);
            line.setAttribute('style', `stroke: ${strokeColor}; stroke-width: ${strokeWidth}`);
            return line;
        };
        const makeText = (text, pos) => {
            const elem = leafSVG.createSvgElem('text');
            // elem.setAttribute('text-anchor', 'middle');
            elem.setAttribute('fill', strokeColor);
            elem.setAttribute('fill-opacity', strokeOpacity);
            elem.setAttribute('font-size', 20);
            elem.setAttribute('font-weight', 'bold');
            // elem.setAttribute('transform', `rotate(${textRotate}, ${center.x},${center.y})`);
            elem.setAttribute('x', pos[0]);
            elem.setAttribute('y', pos[1]);
            elem.textContent = text;
            return elem;
        };


        // TODO: better bounds checking??
        for (let gameX = mcLLX; gameX <= mcURX + (delta / 2); gameX += delta) {
            const [top, bottom] = [[gameX, mcURY], [gameX, mcLLY]].map(gameToLayer);
            const line = makeLine(
                [Math.round(top.x + halfStrokeWidth), Math.round(top.y + halfStrokeWidth)],
                [Math.round(bottom.x + halfStrokeWidth), Math.round(bottom.y + halfStrokeWidth)]
            );
            this._gElem.appendChild(line);
            const text = makeText(gameX, [Math.round(top.x) + 5, 0]);
            this._gElem.appendChild(text);
        }


        // console.log(this._map.getPixelBounds());

        for (let gameY = mcLLY; gameY <= mcURY + (delta / 2); gameY += delta) {
            const [left, right] = [[mcLLX, gameY], [mcURX, gameY]].map(gameToLayer);
            const line = makeLine(
                [Math.round(left.x + halfStrokeWidth), Math.round(left.y + halfStrokeWidth)],
                [Math.round(right.x + halfStrokeWidth), Math.round(right.y + halfStrokeWidth)]
            );
            this._gElem.appendChild(line);
        }
    },

    _removeGrid: function () {
        Array.from(this._gElem.children).forEach((elem) => this._gElem.removeChild(elem));
    }

});