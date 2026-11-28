jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: () => Promise.resolve(), deactivateKeepAwake: () => Promise.resolve() }));
import { allowSleep, heldTags, stayAwake } from '../src/keepAwake';

describe('keep-awake tags', () => {
  it('keeps a tag held until every holder has released it', () => {
    stayAwake('customise');
    stayAwake('customise');
    expect(heldTags()).toEqual(['customise']);
    allowSleep('customise');
    expect(heldTags()).toEqual(['customise']);
    allowSleep('customise');
    expect(heldTags()).toEqual([]);
  });

  it('ignores a release for a tag nobody holds', () => {
    allowSleep('nothing');
    expect(heldTags()).toEqual([]);
  });
});
