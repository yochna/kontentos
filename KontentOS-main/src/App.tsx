/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { VideoAudioExtractorTest } from './components/VideoAudioExtractorTest';

export default function App(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0d101d] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      <VideoAudioExtractorTest />
    </div>
  );
}

