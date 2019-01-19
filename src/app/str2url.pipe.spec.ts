import { Str2urlPipe } from './str2url.pipe';

describe('Str2urlPipe', () => {
  it('create an instance', () => {
    const pipe = new Str2urlPipe();
    expect(pipe).toBeTruthy();
  });
});
