import React, { useState } from 'react';
import { GeneratedSlide, Slide } from './types';
import { generatePresentationScript, generateImageForSlide, generateNarrationAudio } from './services/geminiService';
import { decode, decodeAudioData } from './utils/audioUtils';
import PresentationViewer from './components/PresentationViewer';
import { LoadingSpinner, SparklesIcon, DownloadIcon } from './components/icons';

const App: React.FC = () => {
  const [topic, setTopic] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [generatedSlides, setGeneratedSlides] = useState<GeneratedSlide[]>([]);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedSlides([]);
    setAudioUrl('');

    try {
      // 1. Generate script
      setLoadingMessage('Crafting the presentation script...');
      const scriptSlides = await generatePresentationScript(topic);

      // 2. Generate images in parallel
      setLoadingMessage('Generating visuals for each slide...');
      const imagePromises = scriptSlides.map(slide => generateImageForSlide(slide.imagePrompt));
      const base64Images = await Promise.all(imagePromises);

      const slidesWithImages: GeneratedSlide[] = scriptSlides.map((slide, index) => ({
        ...slide,
        imageUrl: `data:image/png;base64,${base64Images[index]}`,
      }));
      setGeneratedSlides(slidesWithImages);

      // 3. Generate narration
      setLoadingMessage('Recording the voice narration...');
      const fullNarrationScript = slidesWithImages.map(s => s.narration).join(' ');
      const base64Audio = await generateNarrationAudio(fullNarrationScript);

      // 4. Decode and create audio URL
      setLoadingMessage('Finalizing audio...');
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const audioBytes = decode(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, audioContext, 24000, 1);
      
      // Convert AudioBuffer to a playable format like WAV blob
      const wavBlob = bufferToWav(audioBuffer);
      const url = URL.createObjectURL(wavBlob);
      setAudioUrl(url);

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };
  
    // Utility to convert AudioBuffer to a WAV Blob
  const bufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < buffer.numberOfChannels; i++)
      channels.push(buffer.getChannelData(i));

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([view], { type: 'audio/wav' });

    function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  };

  const handleDownload = async () => {
    if (generatedSlides.length === 0 || !audioUrl) return;

    setIsDownloading(true);
    setError(null);

    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720; // 16:9 aspect ratio
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        const videoStream = canvas.captureStream(30); // 30 FPS

        const audioContext = new AudioContext();
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const audioDestination = audioContext.createMediaStreamDestination();
        const audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioDestination);
        const audioStream = audioDestination.stream;

        const combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...audioStream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9,opus' });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${topic.replace(/\s+/g, '_') || 'presentation'}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

        recorder.start();
        audioSource.start();

        const averageWPM = 180;
        const slideDurations = generatedSlides.map(slide => (slide.narration.split(/\s+/).length / averageWPM) * 60 * 1000);
        
        const images = await Promise.all(
            generatedSlides.map(slide => new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = slide.imageUrl;
                img.onload = () => resolve(img);
                img.onerror = reject;
            }))
        );

        let currentSlideIndex = 0;
        let slideTimeoutId: number;

        const renderLoop = () => {
            if (recorder.state !== 'recording' || !ctx) return;
            
            const img = images[currentSlideIndex];
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const canvasAspect = canvas.width / canvas.height;
            const imgAspect = img.width / img.height;
            let drawWidth, drawHeight, dx, dy;

            if (canvasAspect > imgAspect) {
                drawHeight = canvas.height;
                drawWidth = drawHeight * imgAspect;
            } else {
                drawWidth = canvas.width;
                drawHeight = drawWidth / imgAspect;
            }
            dx = (canvas.width - drawWidth) / 2;
            dy = (canvas.height - drawHeight) / 2;
            
            ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
            
            requestAnimationFrame(renderLoop);
        };

        const startSlideShow = () => {
            let slideIndex = 0;
            function nextSlide() {
                if (slideIndex >= generatedSlides.length) return;
                currentSlideIndex = slideIndex;
                slideTimeoutId = setTimeout(() => {
                    slideIndex++;
                    nextSlide();
                }, slideDurations[slideIndex]);
            }
            nextSlide();
        };

        requestAnimationFrame(renderLoop);
        startSlideShow();
        
        await new Promise(resolve => {
            audioSource.onended = () => {
                clearTimeout(slideTimeoutId);
                resolve(null);
            };
        });

        recorder.stop();
    } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to generate video.');
    } finally {
        setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
            AI Presentation Generator
          </h1>
          <p className="mt-4 text-lg text-gray-400">
            Turn any topic into a beautiful, narrated video presentation in seconds.
          </p>
        </header>

        <main>
          {generatedSlides.length === 0 ? (
            <div className="bg-gray-800/50 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-gray-700">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., The History of Space Exploration"
                  className="flex-grow bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                  disabled={isLoading}
                />
                <button
                  onClick={handleGenerate}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
                >
                  {isLoading ? (
                    <>
                      <LoadingSpinner />
                      <span>{loadingMessage || 'Generating...'}</span>
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-5 h-5 mr-2" />
                      <span>Generate Presentation</span>
                    </>
                  )}
                </button>
              </div>
              {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
            </div>
          ) : (
            <div>
                <PresentationViewer slides={generatedSlides} audioUrl={audioUrl} />
                <div className="text-center mt-6 flex flex-wrap justify-center gap-4">
                    <button
                        onClick={() => { setGeneratedSlides([]); setTopic(''); setAudioUrl(''); }}
                        className="px-6 py-2 bg-gray-700 text-gray-300 font-semibold rounded-lg hover:bg-gray-600 transition-colors"
                    >
                        Create a New Presentation
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
                      >
                        {isDownloading ? (
                          <>
                            <LoadingSpinner />
                            <span>Preparing Video...</span>
                          </>
                        ) : (
                          <>
                            <DownloadIcon className="w-5 h-5 mr-2" />
                            <span>Download Presentation</span>
                          </>
                        )}
                    </button>
                </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
