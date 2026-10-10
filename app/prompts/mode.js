import * as tailor from './tailor_v3.js';
import * as enhance from './enhance_v2.js';
export const promptFor = req => req.options?.mode === 'enhance' ? enhance : tailor;
