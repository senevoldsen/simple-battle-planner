/*
    In Leaflet with CRS.Simple:
        - lat decreases when going down
        - lng increases when going right

    Top Left is top left point of topleft tiles.
*/

export class Map {
    constructor(mapInfo) {
        this.info = mapInfo;

        this.constants = {
            gameWidth: mapInfo.upperRightPos[0] - mapInfo.lowerLeftPos[0],
            gameHeight: mapInfo.upperRightPos[1] - mapInfo.lowerLeftPos[1],
            innerWidth: mapInfo.upperRightPixel[0] - mapInfo.lowerLeftPixel[0],
            innerHeight: mapInfo.upperRightPixel[1] - mapInfo.lowerLeftPixel[1],
            lowerLeftPixel: mapInfo.lowerLeftPixel,
            upperRightPixel: mapInfo.upperRightPixel,
            lowerLeftPos: mapInfo.lowerLeftPos,
            upperRightPos: mapInfo.upperRightPos
        };        
    }

    gameToMap(pos) {
        const MC = this.constants;
        const uX = (pos[0] - MC.lowerLeftPos[0]) / MC.gameWidth,
            uY = (pos[1] - MC.lowerLeftPos[1]) / MC.gameHeight;
        const rX = MC.lowerLeftPixel[0] + MC.innerWidth * uX;
        const rY = -MC.upperRightPixel[1] + MC.innerHeight * (1-uY);
        // Swap to get 'lat' / Y coordinate first.
        return [rY, rX];
    }

    mapToGame(pos) {
        var pX, pY;
        if ('lat' in pos) {
            pX = pos.lng;
            pY = pos.lat;
        } else {
            pX = pos[1],
            pY = pos[0];    
        }
        const MC = this.constants;
        const uX = (pX - MC.lowerLeftPixel[0]) / MC.innerWidth;
        const uY = (-pY - MC.lowerLeftPixel[1]) / MC.innerHeight;
        return [uX * MC.gameWidth, uY * MC.gameHeight];
    }
}
