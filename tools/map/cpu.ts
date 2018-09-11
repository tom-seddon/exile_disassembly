import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

const N_MASK = 0x80;
const V_MASK = 0x40;
const U_MASK = 0x20;
const B_MASK = 0x10;
const D_MASK = 0x08;
const I_MASK = 0x04;
const Z_MASK = 0x02;
const C_MASK = 0x01;

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

export class CPU {
    public static make16(l: number, h: number): number {
        return l | h << 8;
    }

    private static getRegDescription(name: string, value: number, width: number): string {
        return name + '=$' + value.toString(16).padStart(width, '0');
    }

    private static getPFlag(name: string, value: boolean): string {
        return value ? name.toUpperCase() : name.toLowerCase();
    }

    public readonly mem: Buffer;
    public a: number;
    public x: number;
    public y: number;
    public n: boolean;
    public v: boolean;
    public d: boolean;
    public i: boolean;
    public z: boolean;
    public c: boolean;
    public s: number;
    public pc: number;
    public handleUnknownOpcode: ((opcode: number) => boolean) | undefined;

    public constructor() {
        this.mem = Buffer.alloc(65536);

        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.n = false;
        this.v = false;
        this.d = false;
        this.i = false;
        this.z = false;
        this.c = false;
        this.s = 0xff;
        this.pc = 0;

        this.reset();
    }

    public clearMemory() {
        this.mem.fill(0);
    }

    public reset() {
        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.setP(I_MASK);
        this.pc = this.read16(0xfffc);
    }

    public getDescription(): string {
        let d = '';

        d += CPU.getRegDescription('PC', this.pc, 4);
        d += ' ' + CPU.getRegDescription('A', this.a, 2);
        d += ' ' + CPU.getRegDescription('X', this.x, 2);
        d += ' ' + CPU.getRegDescription('Y', this.y, 2);
        d += ' ' + CPU.getRegDescription('S', this.s, 2);

        d += ' P=';
        d += CPU.getPFlag('n', this.n);
        d += CPU.getPFlag('v', this.n);
        d += '--';
        d += CPU.getPFlag('d', this.d);
        d += CPU.getPFlag('i', this.i);
        d += CPU.getPFlag('z', this.z);
        d += CPU.getPFlag('c', this.c);

        return d;
    }

    public setP(p: number) {
        this.n = (p & N_MASK) !== 0;
        this.v = (p & V_MASK) !== 0;
        //this.b = (p & B_MASK) != 0;
        this.d = (p & D_MASK) !== 0;
        this.i = (p & I_MASK) !== 0;
        this.z = (p & Z_MASK) !== 0;
        this.c = (p & C_MASK) !== 0;
    }

    public read8(addr: number): number {
        return this.mem[addr & 0xffff];
    }

    public write8(addr: number, value: number): void {
        this.mem[addr & 0xffff] = value;
    }

    public read16(addr: number): number {
        return CPU.make16(this.read8(addr), this.read8(addr + 1));
    }

    public step() {
        const opcode = this.read8(this.pc++);

        switch (opcode) {
            default:
                {
                    let handled = false;

                    if (this.handleUnknownOpcode !== undefined) {
                        handled = this.handleUnknownOpcode(opcode);
                    }

                    if (!handled) {
                        throw new Error('unhandled opcode: 0x' + opcode.toString(16));
                    }
                }
                break;

            case 0x00:
                this.BRK();
                break;

            case 0x01:
                this.ORA(this.readInx());
                break;

            case 0x05:
                this.ORA(this.readZpg());
                break;

            case 0x06:
                this.ASL(this.addrZpg());
                break;

            case 0x08:
                this.PHP();
                break;

            case 0x09:
                this.ORA(this.readImm());
                break;

            case 0x0a:
                this.ASLA();
                break;

            case 0x0d:
                this.ORA(this.readAbs());
                break;

            case 0x0e:
                this.ASL(this.addrAbs());
                break;

            case 0x10:
                this.BPL();
                break;

            case 0x11:
                this.ORA(this.readIny());
                break;

            case 0x15:
                this.ORA(this.readZpx());
                break;

            case 0x16:
                this.ASL(this.addrZpx());
                break;

            case 0x18:
                this.CLC();
                break;

            case 0x19:
                this.ORA(this.readAby());
                break;

            case 0x1d:
                this.ORA(this.readAbx());
                break;

            case 0x1e:
                this.ASL(this.addrAbx());
                break;

            case 0x20:
                this.JSR(this.addrAbs());
                break;

            case 0x21:
                this.AND(this.readInx());
                break;

            case 0x24:
                this.BIT(this.readZpg());
                break;

            case 0x25:
                this.AND(this.readZpg());
                break;

            case 0x26:
                this.ROL(this.addrZpg());
                break;

            case 0x28:
                this.PLP();
                break;

            case 0x29:
                this.AND(this.readImm());
                break;

            case 0x2a:
                this.ROLA();
                break;

            case 0x2c:
                this.BIT(this.readAbs());
                break;

            case 0x2d:
                this.AND(this.readAbs());
                break;

            case 0x2e:
                this.ROL(this.addrAbs());
                break;

            case 0x30:
                this.BMI();
                break;

            case 0x31:
                this.AND(this.readIny());
                break;

            case 0x35:
                this.AND(this.readZpx());
                break;

            case 0x36:
                this.ROL(this.addrZpx());
                break;

            case 0x38:
                this.SEC();
                break;

            case 0x39:
                this.AND(this.readAby());
                break;

            case 0x3d:
                this.AND(this.readAbx());
                break;

            case 0x3e:
                this.ROL(this.addrAbx());
                break;

            case 0x40:
                this.RTI();
                break;

            case 0x41:
                this.EOR(this.readInx());
                break;

            case 0x45:
                this.EOR(this.readZpg());
                break;

            case 0x46:
                this.LSR(this.addrZpg());
                break;

            case 0x48:
                this.PHA();
                break;

            case 0x49:
                this.EOR(this.readImm());
                break;

            case 0x4a:
                this.LSRA();
                break;

            case 0x4c:
                this.JMP(this.addrAbs());
                break;

            case 0x4d:
                this.EOR(this.readAbs());
                break;

            case 0x4e:
                this.LSR(this.addrAbs());
                break;

            case 0x50:
                this.BVC();
                break;

            case 0x51:
                this.EOR(this.readIny());
                break;

            case 0x55:
                this.EOR(this.readZpx());
                break;

            case 0x56:
                this.LSR(this.addrZpx());
                break;

            case 0x58:
                this.CLI();
                break;

            case 0x59:
                this.EOR(this.readAby());
                break;

            case 0x5d:
                this.EOR(this.readAbx());
                break;

            case 0x5e:
                this.LSR(this.addrAbx());
                break;

            case 0x60:
                this.RTS();
                break;

            case 0x61:
                this.ADC(this.readInx());
                break;

            case 0x65:
                this.ADC(this.readZpg());
                break;

            case 0x66:
                this.ROR(this.addrZpg());
                break;

            case 0x68:
                this.PLA();
                break;

            case 0x69:
                this.ADC(this.readImm());
                break;

            case 0x6a:
                this.RORA();
                break;

            case 0x6c:
                this.JMP(this.addrInd());
                break;

            case 0x6d:
                this.ADC(this.readAbs());
                break;

            case 0x6e:
                this.ROR(this.addrAbs());
                break;

            case 0x70:
                this.BVS();
                break;

            case 0x71:
                this.ADC(this.readIny());
                break;

            case 0x75:
                this.ADC(this.readZpx());
                break;

            case 0x76:
                this.ROR(this.addrZpx());
                break;

            case 0x78:
                this.SEI();
                break;

            case 0x79:
                this.ADC(this.readAby());
                break;

            case 0x7d:
                this.ADC(this.readAbx());
                break;

            case 0x7e:
                this.ROR(this.addrAbx());
                break;

            case 0x81:
                this.STA(this.addrInx());
                break;

            case 0x84:
                this.STY(this.addrZpg());
                break;

            case 0x85:
                this.STA(this.addrZpg());
                break;

            case 0x86:
                this.STX(this.addrZpg());
                break;

            case 0x88:
                this.DEY();
                break;

            case 0x8a:
                this.TXA();
                break;

            case 0x8c:
                this.STY(this.addrAbs());
                break;

            case 0x8d:
                this.STA(this.addrAbs());
                break;

            case 0x8e:
                this.STX(this.addrAbs());
                break;

            case 0x90:
                this.BCC();
                break;

            case 0x91:
                this.STA(this.addrIny());
                break;

            case 0x94:
                this.STY(this.addrZpx());
                break;

            case 0x95:
                this.STA(this.addrZpx());
                break;

            case 0x96:
                this.STX(this.addrZpy());
                break;

            case 0x98:
                this.TYA();
                break;

            case 0x99:
                this.STA(this.addrAby());
                break;

            case 0x9a:
                this.TXS();
                break;

            case 0x9d:
                this.STA(this.addrAbx());
                break;

            case 0xa0:
                this.LDY(this.readImm());
                break;

            case 0xa1:
                this.LDA(this.readInx());
                break;

            case 0xa2:
                this.LDX(this.readImm());
                break;

            case 0xa4:
                this.LDY(this.readZpg());
                break;

            case 0xa5:
                this.LDA(this.readZpg());
                break;

            case 0xa6:
                this.LDX(this.readZpg());
                break;

            case 0xa8:
                this.TAY();
                break;

            case 0xa9:
                this.LDA(this.readImm());
                break;

            case 0xaa:
                this.TAX();
                break;

            case 0xac:
                this.LDY(this.readAbs());
                break;

            case 0xad:
                this.LDA(this.readAbs());
                break;

            case 0xae:
                this.LDX(this.readAbs());
                break;

            case 0xb0:
                this.BCS();
                break;

            case 0xb1:
                this.LDA(this.readIny());
                break;

            case 0xb4:
                this.LDY(this.readZpx());
                break;

            case 0xb5:
                this.LDA(this.readZpx());
                break;

            case 0xb6:
                this.LDX(this.readZpy());
                break;

            case 0xb8:
                this.CLV();
                break;

            case 0xb9:
                this.LDA(this.readAby());
                break;

            case 0xba:
                this.TSX();
                break;

            case 0xbc:
                this.LDY(this.readAbx());
                break;

            case 0xbd:
                this.LDA(this.readAbx());
                break;

            case 0xbe:
                this.LDX(this.readAby());
                break;

            case 0xc0:
                this.CPY(this.readImm());
                break;

            case 0xc1:
                this.CMP(this.readInx());
                break;

            case 0xc4:
                this.CPY(this.readZpg());
                break;

            case 0xc5:
                this.CMP(this.readZpg());
                break;

            case 0xc6:
                this.DEC(this.addrZpg());
                break;

            case 0xc8:
                this.INY();
                break;

            case 0xc9:
                this.CMP(this.readImm());
                break;

            case 0xca:
                this.DEX();
                break;

            case 0xcc:
                this.CPY(this.readAbs());
                break;

            case 0xcd:
                this.CMP(this.readAbs());
                break;

            case 0xce:
                this.DEC(this.addrAbs());
                break;

            case 0xd0:
                this.BNE();
                break;

            case 0xd1:
                this.CMP(this.readIny());
                break;

            case 0xd5:
                this.CMP(this.readZpx());
                break;

            case 0xd6:
                this.DEC(this.addrZpx());
                break;

            case 0xd8:
                this.CLD();
                break;

            case 0xd9:
                this.CMP(this.readAby());
                break;

            case 0xdd:
                this.CMP(this.readAbx());
                break;

            case 0xde:
                this.DEC(this.addrAbx());
                break;

            case 0xe0:
                this.CPX(this.readImm());
                break;

            case 0xe1:
                this.SBC(this.readInx());
                break;

            case 0xe4:
                this.CPX(this.readZpg());
                break;

            case 0xe5:
                this.SBC(this.readZpg());
                break;

            case 0xe6:
                this.INC(this.addrZpg());
                break;

            case 0xe8:
                this.INX();
                break;

            case 0xe9:
                this.SBC(this.readImm());
                break;

            case 0xea:
                //this.NOP();
                break;

            case 0xec:
                this.CPX(this.readAbs());
                break;

            case 0xed:
                this.SBC(this.readAbs());
                break;

            case 0xee:
                this.INC(this.addrAbs());
                break;

            case 0xf0:
                this.BEQ();
                break;

            case 0xf1:
                this.SBC(this.readIny());
                break;

            case 0xf5:
                this.SBC(this.readZpx());
                break;

            case 0xf6:
                this.INC(this.addrZpx());
                break;

            case 0xf8:
                this.SED();
                break;

            case 0xf9:
                this.SBC(this.readAby());
                break;

            case 0xfd:
                this.SBC(this.readAbx());
                break;

            case 0xfe:
                this.INC(this.addrAbx());
                break;
        }
    }

    private getP(b: boolean): number {
        let p = 0;

        if (this.n) {
            p |= N_MASK;
        }

        if (this.v) {
            p |= V_MASK;
        }

        p |= U_MASK;

        if (b) {
            p |= B_MASK;
        }

        if (this.d) {
            p |= D_MASK;
        }

        if (this.i) {
            p |= I_MASK;
        }

        if (this.z) {
            p |= Z_MASK;
        }

        if (this.c) {
            p |= C_MASK;
        }

        return p;
    }

    private setNZ(x: number): void {
        this.n = (x & 0x80) !== 0;
        this.z = (x & 0xff) === 0;
    }

    private doLSR(x: number): number {
        this.c = (x & 1) !== 0;
        x >>= 1;
        x &= 0xff;
        this.setNZ(x);
        return x;
    }

    private doASL(x: number): number {
        this.c = (x & 0x80) !== 0;
        x <<= 1;
        x &= 0xff;
        this.setNZ(x);
        return x;
    }

    private doROL(x: number): number {
        const c = (x & 0x80) !== 0;
        x <<= 1;
        x &= 0xff;
        x |= this.c ? 1 : 0;
        this.c = c;
        this.setNZ(x);
        return x;
    }

    private doROR(x: number): number {
        const c = (x & 1) !== 0;
        x >>= 1;
        x &= 0xff;
        x |= this.c ? 0x80 : 0;
        this.c = c;
        this.setNZ(x);
        return x;
    }

    private DEX(): void {
        this.x = this.doDEC(this.x);
    }

    private INX(): void {
        this.x = this.doINC(this.x);
    }

    private DEY(): void {
        this.y = this.doDEC(this.y);
    }

    private INY(): void {
        this.y = this.doINC(this.y);
    }

    private doDEC(x: number): number {
        return this.doINCDEC(x, -1);
    }

    private doINC(x: number): number {
        return this.doINCDEC(x, 1);
    }

    private doINCDEC(x: number, dx: number): number {
        x += dx;
        x &= 0xff;
        this.setNZ(x);
        return x;
    }

    private doCP(reg: number, value: number): void {
        this.c = reg >= value;
        this.z = reg === value;
        this.n = ((reg - value) & 0x80) !== 0;
    }

    private ADC(data: number): void {
        if (this.d) {
            let tmp = (this.a & 0xf) + (data & 0xf) + (this.c ? 1 : 0);
            if (tmp > 9) {
                tmp += 6;
            }
            if (tmp <= 0xf) {
                tmp = (tmp & 0xf) + (this.a & 0xf0) + (data & 0xf0);
            } else {
                tmp = (tmp & 0xf) + (this.a & 0xf0) + (data & 0xf0) + 0x10;
            }

            this.z = false;
            this.v = false;
            this.n = false;

            if (((this.a + data + (this.c ? 1 : 0)) & 0xff) === 0) {
                this.z = true;
            }

            if ((tmp & 0x80) !== 0) {
                this.n = true;
            }

            if (((this.a ^ tmp) & 0x80) !== 0 && ((this.a ^ data) & 0x80) === 0) {
                this.v = true;
            }

            if ((tmp & 0x1f0) > 0x90) {
                tmp += 0x60;
            }

            this.c = (tmp & 0xff0) > 0xf0;

            this.a = tmp & 0xff;
        } else {
            const result = this.a + data + (this.c ? 1 : 0);

            this.setNZ(result & 0xff);
            this.c = result >= 0x100;
            this.v = (~(this.a ^ data) & (this.a ^ result) & 0x80) !== 0;

            this.a = result & 0xff;
        }
    }

    private SBC(data: number): void {
        const result = this.a + ((~data) & 0xff) + (this.c ? 1 : 0);

        if (this.d) {
            let tmp = (this.a & 0xf) - (data & 0xf) - (this.c ? 0 : 1);

            if ((tmp & 0x10) !== 0) {
                tmp = ((tmp - 6) & 0xf) | ((this.a & 0xf0) - (data & 0xf0) - 0x10);
            } else {
                tmp = (tmp & 0xf) | ((this.a & 0xf0) - (data & 0xf0));
            }

            if ((tmp & 0x100) !== 0) {
                tmp -= 0x60;
            }

            this.setNZ(result);

            this.c = result >= 0x100;
            this.v = (((this.a ^ result) & 0x80) & ((this.a ^ data) & 0x80)) !== 0;
            this.a = tmp & 0xff;
        } else {
            this.setNZ(result);
            this.c = result >= 0x100;
            this.v = ((this.a ^ data) & (this.a ^ result) & 0x80) !== 0;
            this.a = result & 0xff;
        }
    }

    private BIT(data: number): void {
        const result = this.a & data & 0xff;

        this.z = result === 0;
        this.v = (data & V_MASK) !== 0;
        this.n = (data & N_MASK) !== 0;
    }

    private B(branch: boolean): void {
        let delta = this.fetchOperand8();
        if ((delta & 0x80) !== 0) {
            delta &= 0x7f;
            delta += -128;
        }

        if (branch) {
            this.pc += delta;
        }
    }

    private BPL(): void {
        this.B(!this.n);
    }

    private BMI(): void {
        this.B(this.n);
    }

    private BVC(): void {
        this.B(!this.v);
    }

    private BVS(): void {
        this.B(this.v);
    }

    private BEQ(): void {
        this.B(this.z);
    }

    private BNE(): void {
        this.B(!this.z);
    }

    private BCC(): void {
        this.B(!this.c);
    }

    private BCS(): void {
        this.B(this.c);
    }

    private CMP(data: number): void {
        this.doCP(this.a, data);
    }

    private CPX(data: number): void {
        this.doCP(this.x, data);
    }

    private CPY(data: number): void {
        this.doCP(this.y, data);
    }

    private AND(data: number): void {
        this.a &= data;
        this.setNZ(this.a);
    }

    private EOR(data: number): void {
        this.a ^= data;
        this.setNZ(this.a);
    }

    private ORA(data: number): void {
        this.a |= data;
        this.setNZ(this.a);
    }

    private doLD(data: number): number {
        this.setNZ(data);
        return data;
    }

    private LDA(data: number): void {
        this.a = this.doLD(data);
    }

    private LDX(data: number): void {
        this.x = this.doLD(data);
    }

    private LDY(data: number): void {
        this.y = this.doLD(data);
    }

    private ASL(addr: number): void {
        this.write8(addr, this.doASL(this.read8(addr)));
    }

    private ASLA(): void {
        this.a = this.doASL(this.a);
    }

    private LSR(addr: number): void {
        this.write8(addr, this.doLSR(this.read8(addr)));
    }

    private LSRA(): void {
        this.a = this.doLSR(this.a);
    }

    private ROL(addr: number): void {
        this.write8(addr, this.doROL(this.read8(addr)));
    }

    private ROLA(): void {
        this.a = this.doROL(this.a);
    }

    private ROR(addr: number): void {
        this.write8(addr, this.doROR(this.read8(addr)));
    }

    private RORA(): void {
        this.a = this.doROR(this.a);
    }

    private DEC(addr: number): void {
        this.write8(addr, this.doDEC(this.read8(addr)));
    }

    private INC(addr: number): void {
        this.write8(addr, this.doINC(this.read8(addr)));
    }

    private CLC(): void {
        this.c = false;
    }

    private SEC(): void {
        this.c = true;
    }

    private SED(): void {
        this.d = true;
    }

    private SEI(): void {
        this.i = true;
    }

    private CLV(): void {
        this.v = false;
    }

    private CLD(): void {
        this.d = false;
    }

    private CLI(): void {
        this.i = false;
    }

    private PHP(): void {
        this.push(this.getP(true));
    }

    private PHA(): void {
        this.push(this.a);
    }

    private PLA(): void {
        this.a = this.pop();
        this.setNZ(this.a);
    }

    private PLP(): void {
        this.setP(this.pop());
    }

    private pop(): number {
        ++this.s;
        return this.read8(0x100 + (this.s & 0xff));
    }

    private push(value: number): void {
        this.write8(0x100 + (this.s & 0xff), value);
        --this.s;
    }

    private RTS(): void {
        const pcl = this.pop();
        const pch = this.pop();
        this.pc = CPU.make16(pcl, pch) + 1;
    }

    private RTI(): void {
        this.setP(this.pop());
        const pcl = this.pop();
        const pch = this.pop();
        this.pc = CPU.make16(pcl, pch);
    }

    private JSR(addr: number): void {
        const pushPC = this.pc - 1;

        this.pc = addr & 0xffff;

        this.push((pushPC >> 8) & 0xff);
        this.push(pushPC & 0xff);
    }

    private JMP(addr: number): void {
        this.pc = addr;
    }

    private TAY(): void {
        this.y = this.a;
        this.setNZ(this.y);
    }

    private TAX(): void {
        this.x = this.a;
        this.setNZ(this.x);
    }

    private TYA(): void {
        this.a = this.y;
        this.setNZ(this.a);
    }

    private TXA(): void {
        this.a = this.x;
        this.setNZ(this.a);
    }

    private TXS(): void {
        this.s = this.x;
    }

    private TSX(): void {
        this.x = this.s;
        this.setNZ(this.x);
    }

    private STA(addr: number): void {
        this.write8(addr, this.a);
    }

    private STX(addr: number): void {
        this.write8(addr, this.x);
    }

    private STY(addr: number): void {
        this.write8(addr, this.y);
    }

    private BRK(): void {
        ++this.pc;
        this.push(this.pc >> 8);
        this.push(this.pc);
        this.push(this.getP(true));
        this.pc = this.read16(0xfffe);
        this.i = true;
    }

    // Operand primitives

    private fetchOperand8(): number {
        return this.read8(this.pc++);
    }

    private fetchOperand16(): number {
        const operand = this.read16(this.pc);
        this.pc += 2;
        return operand;
    }

    // Address operands

    private addrZpg(): number {
        return this.fetchOperand8();
    }

    private addrZpx(): number {
        return (this.addrZpg() + this.x) & 0xff;
    }

    private addrZpy(): number {
        return (this.addrZpg() + this.y) & 0xff;
    }

    private addrAbs(): number {
        return this.fetchOperand16();
    }

    private addrAbx(): number {
        return (this.addrAbs() + this.x) & 0xffff;
    }

    private addrAby(): number {
        return (this.addrAbs() + this.y) & 0xffff;
    }

    private addrInx(): number {
        const zaddr = this.addrZpx();
        return CPU.make16(this.read8(zaddr), this.read8((zaddr + 1) & 0xff));
    }

    private addrIny(): number {
        const zaddr = this.addrZpg();
        const addr = CPU.make16(this.read8(zaddr), this.read8((zaddr + 1) & 0xff));
        return (addr + this.y) & 0xffff;
    }

    private addrInd(): number {
        const laddr = this.addrAbs();
        const l = this.read8(laddr);

        const haddr = (laddr & 0xff00) | ((laddr + 1) & 0xff);
        const h = this.read8(haddr);

        return CPU.make16(l, h);
    }

    // Read instruction operands

    private readImm(): number {
        return this.fetchOperand8();
    }

    private readZpg(): number {
        return this.read8(this.addrZpg());
    }

    private readZpx(): number {
        return this.read8(this.addrZpx());
    }

    private readZpy(): number {
        return this.read8(this.addrZpy());
    }

    private readAbs(): number {
        return this.read8(this.addrAbs());
    }

    private readAbx(): number {
        return this.read8(this.addrAbx());
    }

    private readAby(): number {
        return this.read8(this.addrAby());
    }

    private readInx(): number {
        return this.read8(this.addrInx());
    }

    private readIny(): number {
        return this.read8(this.addrIny());
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

export function runLorenzTestSuite(folderName: string, verbose: boolean) {
    //const folder = "/Users/tom/github/b2/etc/testsuite-2.15/ascii-bin";

    const HACK_OPCODE = 0x02;

    const cpu = new CPU();

    let done = false;

    function v(x: string) {
        if (verbose) {
            process.stderr.write(x);
        }
    }

    function loadFileAndReset(name: string): void {
        const fullPath = path.join(folderName, name);

        if (name === 'nopn') {
            // start of illegal opcode tests (which I'm not going to bother with)
            done = true;
        } else if (name === 'trap1') {
            // start of the C64-specific tests
            done = true;
            return;
        }

        //pn('** Loading from: ' + fullPath);
        const data = fs.readFileSync(fullPath);

        // copy in the loaded program.
        const addr = CPU.make16(data[0], data[1]);
        for (let i = 2; i < data.length; ++i) {
            cpu.write8(addr + i - 2, data[i]);
        }

        v('** ' + fullPath + ': ' + (data.length - 2) + ' bytes at 0x' + addr.toString(16));

        // set up the test environment.
        cpu.mem[0x0002] = 0x00;
        cpu.mem[0xA002] = 0x00;
        cpu.mem[0xA003] = 0x80;
        cpu.mem[0xfffe] = 0x48;
        cpu.mem[0xffff] = 0xff;
        cpu.mem[0x01fe] = 0xff;
        cpu.mem[0x01ff] = 0x7f;

        Buffer.from([
            0x48,                       // PHA
            0x8A,                       // TXA
            0x48,                       // PHA
            0x98,                       // TYA
            0x48,                       // PHA
            0xBA,                       // TSX
            0xBD, 0x04, 0x01,           // LDA    $0104,X
            0x29, 0x10,                 // AND    #$10
            0xF0, 0x03,                 // BEQ    $FF58
            0x6C, 0x16, 0x03,           // JMP    ($0316)
            0x6C, 0x14, 0x03,           // JMP    ($0314)
        ]).copy(cpu.mem, 0xff48);

        cpu.mem[0xffd2] = HACK_OPCODE;
        cpu.mem[0xffd3] = 0x60;

        cpu.mem[0xe16f] = HACK_OPCODE;
        cpu.mem[0xe170] = 0x60;

        cpu.mem[0xffe4] = HACK_OPCODE;
        cpu.mem[0xffe5] = 0x60;

        cpu.mem[0x8000] = HACK_OPCODE;
        cpu.mem[0xa474] = HACK_OPCODE;

        cpu.s = 0xfd;
        cpu.i = true;
        cpu.pc = 0x816;
    }

    cpu.handleUnknownOpcode = (opcode: number): boolean => {
        if (opcode === HACK_OPCODE) {
            const pc = (cpu.pc - 1) & 0xffff;
            //pn('Hack opcode at ' + pc.toString(16));

            if (pc === 0x8000 || pc === 0xa474) {
                throw new Error('test suite failed');
            } else if (pc === 0xffd2) {
                // print
                cpu.mem[0x30c] = 0;
                if (cpu.a === 13) {
                    v('\n');
                } else {
                    v(String.fromCharCode(cpu.a));
                }
            } else if (pc === 0xe16f) {
                // load
                const addr = cpu.read16(0xbb);
                const n = cpu.read8(0xb7);

                const name = cpu.mem.toString('binary', addr, addr + n);

                loadFileAndReset(name);
            } else if (pc === 0xffe4) {
                // scan keyboard
                cpu.a = 3;
            }

            return true;
        } else {
            return false;
        }
    };

    v('Running CPU tests...\n');
    loadFileAndReset('start');

    while (!done) {
        cpu.step();
    }
}
