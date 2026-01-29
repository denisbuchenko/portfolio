export class XorShift32 {
  private state: number;

  constructor(seed: number) {
    // 0 запрещён (застревает), поэтому «подпихнём» если вдруг пришёл 0.
    this.state = (seed | 0) || 0x12345678;
  }

  nextU32(): number {
    // xorshift32
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return x >>> 0;
  }

  next01(): number {
    // [0,1)
    return this.nextU32() / 0x1_0000_0000;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next01();
  }

  int(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }
}


