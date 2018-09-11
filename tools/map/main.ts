import * as argparse from 'argparse';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as colors from 'colors';
import * as pngjs from 'pngjs';
import * as assert from 'assert';
import * as CPU from './CPU';
import * as path from 'path';

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

// Notes
// -----
//
// All graphics are stretched 2x horizontally to account for the Mode 2 aspect
// ratio. This is mostly transparent but there's a couple of '>>1' in the sprite
// plot routine.

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

const PNG_COLOUR_TYPE_RGBA = 6;//how come this isn't part of the library already.
const LORENZ_PATH = './testsuite-2.15/ascii-bin/';

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function p(x: string): void {
    process.stderr.write(x);
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function pn(x: string): void {
    p(x);
    p('\n');
}

function fatal(x: string): void {
    process.stderr.write('FATAL: ' + x + '\n');
    process.exit(1);
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function hex2(x: number): string {
    return x.toString(16).padStart(2, '0');
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

// function unpack(byte: number): Buffer {
//     const pixels = Buffer.alloc(4);

//     for (let bit = 0; bit < 2; ++bit) {
//         for (let pixel = 0; pixel < 4; ++pixel) {
//             pixels[pixel] <<= 1;
//             if (byte & 0x80) {
//                 pixels[pixel] |= 1;
//             }
//             byte <<= 1;
//         }
//     }

//     return pixels;
// }

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

// offsets are into $.EXILEB

const SPRITES_WIDTH = 128;
const SPRITES_HEIGHT = 81;
const NUM_SPRITES = 0x7d;
// const MAP_DATA_OFFSET = 0x4eec;//offset of map_data
//const SPRITE_DATA_OFFSET = 0x52ec;//offset of sprite_data
// const SPRITE_TABLES_OFFSET = SPRITE_DATA_OFFSET + ((SPRITES_WIDTH * SPRITES_HEIGHT) >> 2);
// const SPRITE_WIDTHS_OFFSET = SPRITE_TABLES_OFFSET + 0 * NUM_SPRITES;
// const SPRITE_HEIGHTS_OFFSET = SPRITE_TABLES_OFFSET + 1 * NUM_SPRITES;
// const SPRITE_AS_OFFSET = SPRITE_TABLES_OFFSET + 2 * NUM_SPRITES;
// const SPRITE_BS_OFFSET = SPRITE_TABLES_OFFSET + 3 * NUM_SPRITES;

// const BACKGROUND_LOOKUP_OFFSET = 0x1050;//offset of background_lookup
// const LOOKUP_FOR_UNMATCHED_HASH_OFFSET = 0x107c;//offset of lookup_for_unmatched_hash

// const BACKGROUND_SPRITE_LOOKUP_OFFSET = 0x3ab;
// const BACKGROUND_Y_OFFSET_LOOKUP_OFFSET = 0x3eb;
// const BACKGROUND_PALETTE_LOOKUP_OFFSET = 0x42b;
// const BACKGROUND_WALL_Y_START_BASE_LOOKUP_OFFSET = 0x46b;
// const BACKGROUND_WALL_Y_START_LOOKUP_OFFSET = 0x4ab;
// const BACKGROUND_OBJECTS_RANGE_OFFSET = 0x4d4;
// const BACKGROUND_OBJECTS_DATA_OFFSET_OFFSET = 0x4dd;
// const BACKGROUND_OBJECTS_TYPE_OFFSET_OFFSET = 0x4e6;
// const BACKGROUND_OBJECTS_X_LOOKUP_OFFSET = 0x4ef;
// const BACKGROUND_OBJECTS_HANDLER_LOOKUP_OFFSET = 0x5ee;

let gExile: Buffer;//exile file is loaded starting from offset 0x100
const gSpritePNGs: pngjs.PNG[] = [];

// exports from $.EXILEB
const EXILEB_EXPORTS = {
    square_sprite: 0x08,
    square_orientation: 0x09,
    square_x: 0x95,
    square_y: 0x97,
    determine_background: 0x1715,
    background_sprite_lookup: 0x4ab,
    sprite_data: 0x53ec,
    sprite_width_lookup: 0x5e0c,
    sprite_height_lookup: 0x5e89,
    sprite_offset_a_lookup: 0x5f06,
    sprite_offset_b_lookup: 0x5f83,
    map_data: 0x4fec,
    background_objects_x_lookup: 0x5ef,
    background_objects_range: 0x5d4,
    background_objects_data_offset: 0x5dd,
    background_objects_type_offset: 0x5e6,
    background_lookup: 0x114f,
    background_objects_handler_lookup: 0x6ee,
    lookup_for_unmatched_hash: 0x117c,
    setup_background_sprite_values: 0x2398,

};

// (so in principle this could run off the contents of $.EXILEMC too.)
const X = EXILEB_EXPORTS;

function newExileCPU(): CPU.CPU {
    const cpu = new CPU.CPU();

    gExile.copy(cpu.mem, 0);

    assert.ok(cpu.read16(0x204) === 0x12a6);

    return cpu;
}

function callRoutine(cpu: CPU.CPU, addr: number): void {
    const thunk = 0xf000;

    cpu.mem[thunk + 0] = 0x20;
    cpu.mem[thunk + 1] = addr & 0xff;
    cpu.mem[thunk + 2] = (addr >> 8) & 0xff;

    cpu.pc = thunk;

    while (cpu.pc !== thunk + 3) {
        //pn(cpu.getDescription());
        cpu.step();
    }
}

function savePNG(png: pngjs.PNG, filePath: string): void {
    fs.writeFileSync(filePath, pngjs.PNG.sync.write(png));
}

function getPixel(png: pngjs.PNG, x: number, y: number): number[] {
    if (x >= 0 && x < png.width && y >= 0 && y < png.height) {
        const offset = (y * png.width + x) * 4;

        return [png.data[offset + 0] / 255.0, png.data[offset + 1] / 255.0, png.data[offset + 2] / 255.0];
    } else {
        return [0, 0, 0];
    }
}

function getPixelValue(floatValue: number): number {
    if (floatValue < 0) {
        return 0;
    } else if (floatValue >= 1) {
        return 255;
    } else {
        return Math.floor(floatValue * 256);
    }
}

function setPixel(png: pngjs.PNG, x: number, y: number, pixel: number[]) {
    if (x >= 0 && x < png.width && y >= 0 && y < png.height) {
        const offset = (y * png.width + x) * 4;

        png.data[offset + 0] = getPixelValue(pixel[0]);
        png.data[offset + 1] = getPixelValue(pixel[1]);
        png.data[offset + 2] = getPixelValue(pixel[2]);
        png.data[offset + 3] = 255;
    }
}

// function putSprite(destPNG: pngjs.PNG, destX: number, destY: number, spritePNG: pngjs.PNG, flipX: boolean, flipY: boolean): void {
//     for (let y = 0; y < spritePNG.height; ++y) {
//         let srcY = y;
//         if (flipY) {
//             srcY = spritePNG.height - 1 - srcY;
//         }

//         for (let x = 0; x < spritePNG.width; ++x) {
//             let srcX = x;
//             if (flipX) {
//                 srcX = spritePNG.width - 1 - srcX;
//             }

//             setPixel(destPNG, destX + x, destY + y, getPixel(spritePNG, srcX, srcY));
//         }
//     }
// }

function mustBeValidSprite(sprite: number): void {
    assert.ok(sprite >= 0 && sprite < 0x80, 'invalid sprite');
}

function getSpriteWidth(sprite: number): number {
    mustBeValidSprite(sprite);

    return (1 + (gExile[X.sprite_width_lookup + sprite] >> 4)) * 2;
}

function getSpriteHeight(sprite: number): number {
    mustBeValidSprite(sprite);

    return 1 + (gExile[X.sprite_height_lookup + sprite] >> 3);
}

function putSprite(
    destPNG: pngjs.PNG,
    destX: number,
    destY: number,
    sprite: number,
    flipX: boolean,
    flipY: boolean,
    palette: number[][]): void {
    mustBeValidSprite(sprite);

    const width = getSpriteWidth(sprite);
    const height = getSpriteHeight(sprite);

    const a = gExile[X.sprite_offset_a_lookup + sprite];
    const b = gExile[X.sprite_offset_b_lookup + sprite];

    const srcY = b >> 3 | (b & 7) << 5;

    let srcX = a >> 6 | (a & 7) << 2;
    srcX <<= 2;
    srcX += a >> 4 & 3;

    assert.ok(srcX >= 0 && srcX + (width >> 1) <= SPRITES_WIDTH, 'X bork: srcX=' + srcX + ', width=' + width);
    assert.ok(srcY >= 0 && srcY + height <= SPRITES_HEIGHT, 'Y bork: srcY=' + srcY + ', height=' + height);

    for (let destDY = 0; destDY < height; ++destDY) {
        let srcDY = destDY;
        if (flipY) {
            srcDY = height - 1 - srcDY;
        }

        for (let destDX = 0; destDX < width; ++destDX) {
            let srcDX = destDX;
            if (flipX) {
                srcDX = width - 1 - srcDX;
            }

            const x = srcX + (srcDX >> 1);// >>1 to cater for the width doubling...
            const y = srcY + srcDY;

            const value = gExile[X.sprite_data + ((y * SPRITES_WIDTH + x) >> 2)] << (x & 3);

            let pixel = 0;
            if ((value & 0x80) !== 0) {
                pixel |= 2;
            }

            if ((value & 0x08) !== 0) {
                pixel |= 1;
            }

            setPixel(destPNG, destX + destDX, destY + destDY, palette[pixel]);
        }
    }
}

function makeBeebColour(index: number): number[] {
    return [(index & 1) !== 0 ? 1 : 0, (index & 2) !== 0 ? 1 : 0, (index & 4) !== 0 ? 1 : 0];
}

const DEFAULT_PALETTE = [
    makeBeebColour(0),
    makeBeebColour(1),
    makeBeebColour(7),
    makeBeebColour(2),
];

function doSpritePage(): void {
    const spritesPNG = new pngjs.PNG({ colorType: PNG_COLOUR_TYPE_RGBA, width: SPRITES_WIDTH * 2, height: SPRITES_HEIGHT });

    const palette = [];
    palette.push(makeBeebColour(0));
    palette.push(makeBeebColour(1));
    palette.push(makeBeebColour(7));
    palette.push(makeBeebColour(2));

    for (let y = 0; y < SPRITES_HEIGHT; ++y) {
        for (let x = 0; x < SPRITES_WIDTH; ++x) {
            let byte = gExile[X.sprite_data + ((y * SPRITES_WIDTH + x) >> 2)];

            byte <<= x & 3;

            let pixel = 0;

            if ((byte & 0x80) !== 0) {
                pixel |= 2;
            }

            if ((byte & 0x08) !== 0) {
                pixel |= 1;
            }

            for (let i = 0; i < 2; ++i) {
                setPixel(spritesPNG, x * 2 + i, y, palette[pixel]);
            }
        }
    }

    fs.writeFileSync('./output/sprite_page.png', pngjs.PNG.sync.write(spritesPNG));
}

function doSprites(): void {
    for (let sprite = 0; sprite < NUM_SPRITES; ++sprite) {
        const width = getSpriteWidth(sprite);
        const height = getSpriteHeight(sprite);

        const spritePNG = new pngjs.PNG({ colorType: PNG_COLOUR_TYPE_RGBA, width, height });
        putSprite(spritePNG, 0, 0, sprite, false, false, DEFAULT_PALETTE);
        savePNG(spritePNG, './output/' + hex2(sprite) + '.png');
        gSpritePNGs.push(spritePNG);
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function mustBeByte(x: number): void {
    assert.ok(x >= 0 && x < 256);
}

function mustBeBytes(...xs: number[]): void {
    for (const x of xs) {
        mustBeByte(x);
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

class CpuState {
    public a: number;
    public c: boolean;

    public constructor(a: number, c: boolean) {
        this.a = a;
        this.c = c;
    }

    public asla(): void {
        this.c = (this.a & 0x80) !== 0;
        this.a <<= 1;
        this.a &= 0xff;
    }

    public adc(x: number): void {
        mustBeByte(x);

        const result = this.a + (this.c ? 1 : 0) + x;

        this.a = result & 0xff;
        this.c = result >= 256;
    }

    public and(x: number): void {
        mustBeByte(x);

        this.a &= 0xa8;
    }

    public eor(x: number): void {
        mustBeByte(x);

        this.a ^= 0xa8;
    }

    public lsra(): void {
        this.a = this.lsr(this.a);
    }

    public lsr(x: number): number {
        mustBeByte(x);

        this.c = (x & 1) !== 0;

        x >>= 1;
        x &= 0xff;

        return x;
    }

    public rora(): void {
        this.a = this.ror(this.a);
    }

    public ror(x: number): number {
        mustBeByte(x);

        const c = (x & 1) !== 0;

        x >>= 1;
        x &= 0x7f;
        if (this.c) {
            x |= 0x80;
        }

        this.c = c;

        return x;
    }

    public rola(): void {
        this.a = this.rol(this.a);
    }

    public rol(x: number): number {
        mustBeByte(x);


        const c = (x & 0x80) !== 0;

        x <<= 1;
        x &= 0xfe;
        if (this.c) {
            x |= 1;
        }

        this.c = c;

        return x;
    }
}

function backgroundGrassFrond(): number {
    return 0x62;//0x62 = grass frond
}

function backgroundEmpty(): number {
    return backgroundIs114fLookupWithY(0);
}

function backgroundIs114fLookupWithY(y: number): number {
    mustBeByte(y);

    return gExile[X.background_lookup + y];
}

function notMapped2(squareX: number, squareY: number, f_xy: number): number {
    mustBeBytes(squareX, squareY, f_xy);

    if (squareY < 0x4e) {// cpx #$4e:bcc via_return_background_empty
        return backgroundEmpty();
    } else if (squareY === 0x4e) {//beq l17ec
        // L17EC -> L1937
        const s = new CpuState(squareX, false);
        s.lsra();//lsr a
        s.adc(squareX);//adc square_x
        s.and(0x17);//and #$17
        if (s.a !== 0) {
            // L192a
            s.adc(squareX);
            s.rola();
            s.rola();
            s.rola();
            s.and(0x02);
            s.adc(0x19);
            // tay...
            return backgroundIs114fLookupWithY(s.a);
        } else {
            f_xy = s.ror(f_xy);
            s.rora();
            return s.a;
        }
    } else if (squareY === 0x4f) {//cpx#$4f:bne below_surface
        // Surface
        if (squareX === 0x40) {
            // Force (0x40,0x4f) to be a grass frond
            return backgroundGrassFrond();
        } else {
            // Everything else is wall.
            return backgroundIs114fLookupWithY(1);
        }
    } else {
        // below surface
        return backgroundIs114fLookupWithY(1);//fudge.
    }
}

function L17A8(squareX: number, squareY: number, f_xy: number): number {
    mustBeBytes(squareX, squareY, f_xy);

    if (squareY >= 0x3e && squareY <= 0x48) {
        return notMapped2(squareX, squareY, f_xy);
    }

    if (squareY < 0x3e) {
        squareY += 0x0a;
    }

    // L17B2
    let isMappedData = false;
    let f2_xy = squareY;
    let f3_xy;
    {
        const s = new CpuState(f2_xy, false);
        s.and(0xa8);//and #$a8
        s.eor(0x6f);//eor #$6f
        s.lsra();//lsr a
        s.adc(squareX);//adc square_x
        s.eor(0x60);//eor #$60
        s.adc(0x28);//adc #$28
        f3_xy = s.a;//sta f3_xy
        s.and(0x38);//and #$38
        s.eor(0xa4);//eor #$a4
        s.adc(f2_xy);//adc f2_xy
        f2_xy = s.a;//sta f2_xy
        //tay...???
        s.eor(0x2c);//eor #$2c
        s.adc(f3_xy);//adc f3_xy
        if (f2_xy >= 0x20) {
            return notMapped2(squareX, squareY, f_xy);
        }
        if (s.a >= 0x20) {
            if (s.a < 0x3d) {
                return backgroundEmpty();
            } else {
                return notMapped2(squareX, squareY, f_xy);
            }
        }
        isMappedData = true;
        const y = s.a;
        s.asla();//asl a
        s.asla();//asl a
        s.asla();//asl a
        s.eor(f2_xy);//eor f2_xy
        let mapAddress = s.a;//STA map_address
        mapAddress |= (y & 3) << 8;//tya:and #$03:adc #HI(map_data):sta map_address_high
        return gExile[X.map_data + mapAddress];
    }
}

function calculateBackground(squareX: number, squareY: number): number {
    mustBeBytes(squareX, squareY);

    let f_xy = 0;
    {
        const s = new CpuState(squareY, false);//lda square_y
        s.lsra();//lsr a
        s.eor(squareX);//eor square_x
        s.and(0xf8);//and #$f8
        s.lsra();//lsr a
        s.adc(squareX);//adc square_x
        s.lsra();//lsr a
        s.adc(squareY);//adc square_y
        f_xy = s.a;
    }

    if (squareY < 0x79) {
        //return new MapResult(MapResultType.TODO, 0);
        return L17A8(squareX, squareY, f_xy);
    } else if (squareY < 0xBF) {
        return notMapped2(squareX, squareY, f_xy);
    } else {
        //return new MapResult(MapResultType.TODO, 0);
        return L17A8(squareX, squareY - 0x46, f_xy);
    }
}

function determineBackground(squareX: number, squareY: number): number {
    let squareSprite = calculateBackground(squareX, squareY);

    const backgroundObjectNumber = squareSprite & 0x3f;
    let squareOrientation = squareSprite & 0xc0;

    if (backgroundObjectNumber < 9) {

        // For sprite types S, 0<=S<9, background_objects_range (R) indicates
        // where in the x_lookup table to search.
        //
        // R[S-1] is the index to start at (this is the reason for
        // background_objects_range_minus_one) and R [S] the index to stop at.
        //
        // If squareX is found in the table, get the other details from the
        // other tables.
        //
        // Otherwise, fish it out of the 
        //
        // The futzing about it does with the contents of
        // background_objects_x_lookup can mostly be ignored (I think??) - this
        // is just it temporarily adding a sentinel value, to simplify the loop
        // termination.

        const beginIdx = gExile[X.background_objects_range - 1 + backgroundObjectNumber];
        const endIdx = gExile[X.background_objects_range + backgroundObjectNumber];
        assert.ok(endIdx >= beginIdx);

        let foundIdx = -1;

        for (let idx = beginIdx; idx !== endIdx; ++idx) {
            if (gExile[X.background_objects_x_lookup + idx] === squareX) {
                foundIdx = idx;
                break;
            }
        }

        let newObjectDataPointer = 0;
        let newObjectTypePointer = 0;

        if (foundIdx >= 0) {
            // this is the bit after the loop at L173D. X = foundIdx; Y =
            // backgroundObjectNumber

            // adc background_objects_data_offset,y:sta new_object_data_pointer
            newObjectDataPointer = foundIdx + gExile[X.background_objects_data_offset + backgroundObjectNumber];

            // adc background_objects_type_offset,y:sta new_object_type_pointer
            newObjectTypePointer = newObjectDataPointer + gExile[X.background_objects_type_offset + backgroundObjectNumber];

            // lda background_objects_handler_lookupX
            squareSprite = gExile[X.background_objects_handler_lookup + foundIdx];
        } else {
            // no_background_object_in_hash
            squareSprite = gExile[X.lookup_for_unmatched_hash + backgroundObjectNumber];
            squareSprite ^= squareOrientation;
        }

        // L1761
        //
        // Y=backgroundObjectNumber
        squareOrientation = squareSprite & 0xc0;
    }

    squareSprite &= 0x3f;

    return squareSprite;
}

interface IBackground {
    squareSprite: number;
    squareOrientation: number;
}

function determineBackground6502(squareX: number, squareY: number): IBackground {
    mustBeBytes(squareX, squareY);

    const cpu = newExileCPU();

    cpu.write8(X.square_x, squareX);
    cpu.write8(X.square_y, squareY);
    callRoutine(cpu, X.determine_background);

    assert.ok(cpu.read8(X.square_sprite) === cpu.a);

    const result = {
        squareSprite: cpu.read8(X.square_sprite),
        squareOrientation: cpu.read8(X.square_orientation),
    };

    return result;
}

// function setupBackgroundSpriteValues6502(squareX: number, squareY: number): IBackground {
//     mustBeBytes(squareX, squareY);

//     const cpu = newExileCPU();

//     cpu.write8(X.square_x, squareX);
//     cpu.write8(X.square_y, squareY);
//     callRoutine(cpu, X.setup_background_sprite_values);


// }

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

const TELETEXT_CHARS = [
    '......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......',
    '......|...X..|..X.X.|...XX.|..XXX.|.XX...|..X...|...X..|....X.|..X...|...X..|......|......|......|......|......|...X..|...X..|..XXX.|.XXXXX|....X.|.XXXXX|...XX.|.XXXXX|..XXX.|..XXX.|......|......|....X.|......|..X...|..XXX.|..XXX.|...X..|.XXXX.|..XXX.|.XXXX.|.XXXXX|.XXXXX|..XXX.|.X...X|..XXX.|.....X|.X...X|.X....|.X...X|.X...X|..XXX.|.XXXX.|..XXX.|.XXXX.|..XXX.|.XXXXX|.X...X|.X...X|.X...X|.X...X|.X...X|.XXXXX|......|.X....|......|......|..X.X.|......|......|.X....|......|.....X|......|....X.|......|.X....|...X..|...X..|..X...|..XX..|......|......|......|......|......|......|......|...X..|......|......|......|......|......|......|..X...|..X.X.|.XX...|......|.XXXXX',
    '......|...X..|..X.X.|..X..X|.X.X.X|.XX..X|.X.X..|...X..|...X..|...X..|.X.X.X|...X..|......|......|......|.....X|..X.X.|..XX..|.X...X|.....X|...XX.|.X....|..X...|.....X|.X...X|.X...X|......|......|...X..|......|...X..|.X...X|.X...X|..X.X.|.X...X|.X...X|.X...X|.X....|.X....|.X...X|.X...X|...X..|.....X|.X..X.|.X....|.XX.XX|.X...X|.X...X|.X...X|.X...X|.X...X|.X...X|...X..|.X...X|.X...X|.X...X|.X...X|.X...X|.....X|...X..|.X....|...X..|...X..|..X.X.|......|......|.X....|......|.....X|......|...X..|......|.X....|......|......|..X...|...X..|......|......|......|......|......|......|......|...X..|......|......|......|......|......|......|..X...|..X.X.|...X..|...X..|.XXXXX',
    '......|...X..|..X.X.|..X...|.X.X..|....X.|.X.X..|...X..|..X...|....X.|..XXX.|...X..|......|......|......|....X.|.X...X|...X..|.....X|....X.|..X.X.|.XXXX.|.X....|....X.|.X...X|.X...X|...X..|...X..|..X...|.XXXXX|....X.|....X.|.X.XXX|.X...X|.X...X|.X....|.X...X|.X....|.X....|.X....|.X...X|...X..|.....X|.X.X..|.X....|.X.X.X|.XX..X|.X...X|.X...X|.X...X|.X...X|.X....|...X..|.X...X|.X...X|.X...X|..X.X.|..X.X.|....X.|..X...|.X....|....X.|..XXX.|.XXXXX|......|..XXX.|.XXXX.|..XXXX|..XXXX|..XXX.|...X..|..XXXX|.XXXX.|..XX..|...X..|..X..X|...X..|.XX.X.|.XXXX.|..XXX.|.XXXX.|..XXXX|..X.XX|..XXXX|..XXX.|.X...X|.X...X|.X...X|.X...X|.X...X|.XXXXX|..X...|..X.X.|.XX...|......|.XXXXX',
    '......|...X..|......|.XXX..|..XXX.|...X..|..X...|......|..X...|....X.|...X..|.XXXXX|......|..XXX.|......|...X..|.X...X|...X..|...XX.|...XX.|.X..X.|.....X|.XXXX.|...X..|..XXX.|..XXXX|......|......|.X....|......|.....X|...X..|.X.X.X|.X...X|.XXXX.|.X....|.X...X|.XXXX.|.XXXX.|.X....|.XXXXX|...X..|.....X|.XX...|.X....|.X.X.X|.X.X.X|.X...X|.XXXX.|.X...X|.XXXX.|..XXX.|...X..|.X...X|..X.X.|.X.X.X|...X..|...X..|...X..|.XXXXX|.X....|.XXXXX|.X.X.X|..X.X.|.XXXXX|.....X|.X...X|.X....|.X...X|.X...X|..XXX.|.X...X|.X...X|...X..|...X..|..X.X.|...X..|.X.X.X|.X...X|.X...X|.X...X|.X...X|..XX..|.X....|...X..|.X...X|.X...X|.X...X|..X.X.|.X...X|....X.|..X...|..X.X.|...X..|.XXXXX|.XXXXX',
    '......|...X..|......|..X...|...X.X|..X...|.X.X.X|......|..X...|....X.|..XXX.|...X..|...X..|......|......|..X...|.X...X|...X..|..X...|.....X|.XXXXX|.....X|.X...X|..X...|.X...X|.....X|......|...X..|..X...|.XXXXX|....X.|...X..|.X.XXX|.XXXXX|.X...X|.X....|.X...X|.X....|.X....|.X..XX|.X...X|...X..|.....X|.X.X..|.X....|.X...X|.X..XX|.X...X|.X....|.X.X.X|.X.X..|.....X|...X..|.X...X|..X.X.|.X.X.X|..X.X.|...X..|..X...|..X...|.X.XX.|....X.|...X..|.XXXXX|......|..XXXX|.X...X|.X....|.X...X|.XXXXX|...X..|.X...X|.X...X|...X..|...X..|..XX..|...X..|.X.X.X|.X...X|.X...X|.X...X|.X...X|..X...|..XXX.|...X..|.X...X|..X.X.|.X.X.X|...X..|.X...X|...X..|..X..X|..X.X.|.XX..X|......|.XXXXX',
    '......|......|......|..X...|.X.X.X|.X..XX|.X..X.|......|...X..|...X..|.X.X.X|...X..|...X..|......|......|.X....|..X.X.|...X..|.X....|.X...X|....X.|.X...X|.X...X|..X...|.X...X|....X.|...X..|...X..|...X..|......|...X..|......|.X....|.X...X|.X...X|.X...X|.X...X|.X....|.X....|.X...X|.X...X|...X..|.X...X|.X..X.|.X....|.X...X|.X...X|.X...X|.X....|.X..X.|.X..X.|.X...X|...X..|.X...X|...X..|.X.X.X|.X...X|...X..|.X....|...X..|.....X|...X..|...X..|..X.X.|......|.X...X|.X...X|.X....|.X...X|.X....|...X..|.X...X|.X...X|...X..|...X..|..X.X.|...X..|.X.X.X|.X...X|.X...X|.X...X|.X...X|..X...|.....X|...X..|.X...X|..X.X.|.X.X.X|..X.X.|.X...X|..X...|....XX|..X.X.|....XX|...X..|.XXXXX',
    '......|...X..|......|.XXXXX|..XXX.|....XX|..XX.X|......|....X.|..X...|...X..|......|..X...|......|...X..|......|...X..|..XXX.|.XXXXX|..XXX.|....X.|..XXX.|..XXX.|..X...|..XXX.|..XX..|......|..X...|....X.|......|..X...|...X..|..XXXX|.X...X|.XXXX.|..XXX.|.XXXX.|.XXXXX|.X....|..XXXX|.X...X|..XXX.|..XXX.|.X...X|.XXXXX|.X...X|.X...X|..XXX.|.X....|..XX.X|.X...X|..XXX.|...X..|..XXX.|...X..|..X.X.|.X...X|...X..|.XXXXX|......|....X.|......|......|..X.X.|......|..XXXX|.XXXX.|..XXXX|..XXXX|..XXX.|...X..|..XXXX|.X...X|..XXX.|...X..|..X..X|..XXX.|.X.X.X|.X...X|..XXX.|.XXXX.|..XXXX|..X...|.XXXX.|....X.|..XXXX|...X..|..X.X.|.X...X|..XXXX|.XXXXX|...X.X|..X.X.|...X.X|......|.XXXXX',
    '......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|...X..|......|......|......|......|......|......|......|......|......|......|.....X|......|......|..X...|......|......|......|......|......|.X....|.....X|......|......|......|......|......|......|......|.....X|......|...XXX|......|...XXX|......|......',
    '......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|...XXX|......|......|......|......|......|......|......|......|......|......|..XXX.|......|......|......|......|......|......|......|......|.X....|.....X|......|......|......|......|......|......|......|..XXX.|......|.....X|......|.....X|......|......',
];

function printStr(png: pngjs.PNG, startX: number, startY: number, str: string) {
    let chX = startX;

    const WHITE = [1, 1, 1];

    for (let chIdx = 0; chIdx < str.length; ++chIdx) {
        let c = str.charCodeAt(chIdx);
        if (c < 32 || c >= 126) {
            c = 32;
        }

        const i = (c - 32) * 7;
        for (let y = 0; y < 10; ++y) {
            for (let x = 0; x < 6; ++x) {
                const py = startY + y;
                const px = startX + chIdx * 6 + x;

                let pixel: number[];

                if (TELETEXT_CHARS[y][i + x] === '.') {
                    pixel = getPixel(png, px, py);
                    pixel[0] *= 0.5;
                    pixel[1] *= 0.5;
                    pixel[2] *= 0.5;
                } else {
                    pixel = WHITE;
                }

                setPixel(png, px, py, pixel);
            }
        }

        chX += 6;
    }
}

function doBackground() {
    const miniMapPNG = new pngjs.PNG({ colorType: PNG_COLOUR_TYPE_RGBA, width: 256, height: 256 });
    const fullMapPNG = new pngjs.PNG({ colorType: PNG_COLOUR_TYPE_RGBA, width: 256 * 32, height: 256 * 32 });

    const backgrounds: IBackground[][] = [];
    let numFlipped = 0;


    for (let squareY = 0; squareY < 256; ++squareY) {
        p('squareY: ' + hex2(squareY) + '\r');
        if (process.stderr.isTTY !== true) {
            pn('');
        }
        const backgroundRow: IBackground[] = [];
        backgrounds.push(backgroundRow);
        for (let squareX = 0; squareX < 256; ++squareX) {
            const background = determineBackground6502(squareX, squareY);
            backgroundRow.push(background);

            //pn('(' + squareX + ',' + squareY + '): ' + MapResultType[r.type]);

            // let pixel;
            // switch (r.type) {
            //     case MapResultType.Empty:
            //         pixel = [0, 0, 0];
            //         break;

            //     case MapResultType.Frond:
            //         pixel = [0, 1, 0];
            //         break;

            //     case MapResultType.Lookup114F:
            //         pixel = [1, 0, 0];
            //         break;

            //     case MapResultType.L1937:
            //         pixel = [0, 0, 1];
            //         break;

            //     case MapResultType.TODO:
            //         pixel = [0, 1, 1];
            //         break;

            //     case MapResultType.BelowSurface:
            //         pixel = [0.5, 0.25, 0];
            //         break;

            //     case MapResultType.Mapped:
            //         pixel = [0, 0.5, 0];
            //         break;

            //     default:
            //         pixel = [1, 0, 1];
            //         break;
            // }

            // setPixel(miniMapPNG, squareX, squareY, pixel);

            // const sprite = backgroundSprite & 0x3f;
            // const orientation = backgroundSprite & 0xc0;

            const actualSprite = gExile[X.background_sprite_lookup + background.squareSprite] & 0x7f;

            // if ((actualSprite & 0x80) !== 0) {
            //     ++numFlipped;
            // }

            let spriteX = squareX * 32;
            let spriteY = squareY * 32;
            let flipX = false;
            let flipY = false;

            
            switch (background.squareOrientation & 0xc0) {
                case 0x00:
                    // 00 = bottom left, unflipped
                    flipX = true;
                    spriteY += 32 - getSpriteHeight(actualSprite);
                    break;

                case 0x40:
                    // 40 = top left, vertical flip
                    flipY = true;
                    break;

                case 0x80:
                    // 80 = bottom right, horizontal flip
                    spriteX += 32 - getSpriteWidth(actualSprite);
                    spriteY += 32 - getSpriteHeight(actualSprite);
                    break;

                case 0xc0:
                    // c0 = top right, vertical & horizontal flip
                    spriteX += 32 - getSpriteWidth(actualSprite);
                    flipY = true;
                    break;
            }

            putSprite(fullMapPNG, spriteX, spriteY, actualSprite, flipX, flipY, DEFAULT_PALETTE);

            // const spritePNG = gSpritePNGs[actualSprite & 0x7f];
            // spritePNG.bitblt(fullMapPNG, 0, 0, spritePNG.width, spritePNG.height, squareX * 32, squareY * 32);

            //const sprite = gExile[X.background_sprite_lookup + backgroundSprite];

            // const fullX = squareX * 32;
            // const fullY = squareY * 32;
            // const sprite = gSpritePNGs[backgroundSprite];
            // sprite.bitblt(fullMapPNG, 0, 0, sprite.width, sprite.height, fullX, fullY);
        }
    }

    pn('');

    pn('numFlipped=' + numFlipped);

    pn('Save mini map...');
    savePNG(miniMapPNG, './output/map1.png');

    pn('Save full map...');
    savePNG(fullMapPNG, './output/bigmap.png');

    for (let squareY = 0; squareY < 256; ++squareY) {
        for (let squareX = 0; squareX < 256; ++squareX) {
            const x = squareX * 32;
            const y = squareY * 32;
            const background = backgrounds[squareY][squareX];

            printStr(fullMapPNG, x, y, hex2(squareX) + hex2(squareY));
            printStr(fullMapPNG, x, y + 8, hex2(background.squareSprite) + hex2(background.squareOrientation));
            printStr(fullMapPNG, x, y + 16, hex2(gExile[X.background_sprite_lookup + background.squareSprite]));
        }
    }

    pn('Save full map + overlay...');
    savePNG(fullMapPNG, './output/bigmap_overlay.png');
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

interface ICommandLineOptions {
    test_6502: string | null;
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

async function main(options: ICommandLineOptions) {
    if (options.test_6502 !== null) {
        pn('running test suite...');
        CPU.runLorenzTestSuite(options.test_6502, true);
    }

    const exileb = fs.readFileSync('../../tmp/exileb.new');
    pn('loaded exileb: ' + exileb.length + ' bytes');

    gExile = Buffer.alloc(0x100 + exileb.length);
    exileb.copy(gExile, 0x100);

    try {
        fs.mkdirSync('./output/');
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }

    doSpritePage();
    doSprites();
    doBackground();
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

{
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Exile map/sprites hackery'
    });

    parser.addArgument(['--test-6502'], { metavar: 'PATH', help: 'test 6502 emulator against Lorenz test suite (built for ASCII) stored at PATH' });

    const options = parser.parseArgs();

    main(options).then(() => {
        //process.('main promise completed');
    }).catch((error) => {
        process.stderr.write('Stack trace:\n');
        process.stderr.write(error.stack + '\n');
        process.stderr.write('FATAL: ' + error + '\n');
        process.exit(1);
    });
}
