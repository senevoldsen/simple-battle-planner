
function radToDeg(x) {
    return x * 180 / Math.PI;
}

function degToRad(x) {
    return x * Math.PI / 180;
}

export class Vector extends Array {

    /*
        Constructs a Vector from the arguments

        Either one array argument, or
        Each component of the vector as an argument
    */
    constructor(...components) {
        if (components.length == 1) {
            super(...components[0])
        } else {
            super(...components);    
        }
    }

    get x() {
        return this[0];
    }

    get y() {
        return this[1];
    }

    get z() {
        return this[2];
    }

    set x(val) {
        this[0] = val;
    }

    set y(val) {
        this[1] = val;
    }

    set z(val) {
        this[2] = val;
    }

    copy() {
        return new Vector(this);
    }

    norm() {
        this.scale(1 / this.magnitude());
        return this;
    }

    add(array) {
        array.forEach((x, i) => this[i] += x);
        return this;
    }

    sub(array) {
        array.forEach((x, i) => this[i] -= x);   
        return this;
    }

    negate() {
        this.scale(-1);
        return this;
    }

    dot(array) {
        return this.reduce((a, x, i) => a + (x * array[i]), 0);
    }

    magnitude() {
        const sqrSum = this.reduce((a, x) => a + Math.pow(x, 2), 0);
        return Math.pow(sqrSum, 0.5);
    }

    scale(factor) {
        this.forEach((x, i) => this[i] = x * factor);
        return this;
    }

    perpendicular() {
        const x = this[0];
        this[0] = -this[1];
        this[1] = x;
        return this;
    }

    rotateDeg(degs) {
        return this.rotateRad(degToRad(degs));
    }

    rotateRad(rads) {
        this._applyMatrix2D([
            Math.cos(rads),
            -Math.sin(rads),
            Math.sin(rads),
            Math.cos(rads)
        ]);
        return this;
    }

    angleBetweenRad(array) {
        const other = new Vector(array);
        return Math.atan2(this[1], this[0]) - Math.atan2(other[1], other[0]);
    }

    angleBetweenDeg(array) {
        return radToDeg(this.angleBetweenRad(array));
    }

    angleDeg() {
        return this.angleBetweenDeg([1, 0]);
    }

    angleRad() {
        return this.angleBetweenRad([1, 0]);
    }

    _applyMatrix2D(matrix) {
        const [a, b, c, d] = matrix;
        const x = this[0];
        const y = this[1];
        this[0] = a * x + b * y;
        this[1] = c * x + d * y;
        return this;
    }

    asArray() {
        return Array.from(this);
    }

    toString() {
        return 'Vector (' + this.join(', ') + ')';
    }
}

export function vector(...args) {
    return new Vector(...args);  
} 

window.Vector = Vector;
window.vector = vector;

