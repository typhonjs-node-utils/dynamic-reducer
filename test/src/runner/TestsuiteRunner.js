import TestsuiteRunner  from '@typhonjs-build-test/testsuite-runner';

import {
   ArrayAPIErrors,
   ArrayAPITests,
   ArraySequenceTests,
   // ArrayPerfTest
}                       from './tests/array/index.js';

import {
   MapAPIErrors,
   MapAPITests,
   // MapPerfTest
}                       from './tests/map/index.js';

export default new TestsuiteRunner(
{
   // ArrayAPIErrors,
   // ArrayAPITests,
   ArraySequenceTests,  // For visual inspection
   // ArrayPerfTest        // For performance comparison

   // MapAPIErrors,
   // MapAPITests
   // MapPerfTest
});
