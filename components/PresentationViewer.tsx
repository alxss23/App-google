
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeneratedSlide } from '../types';
import { PlayIcon, PauseIcon } from './icons';

interface PresentationViewerProps {
  slides: GeneratedSlide[];
  audioUrl: string;
}

const PresentationViewer: React.FC<PresentationViewerProps> = ({ slides, audioUrl }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [slideDurations, setSlideDurations] = useState<number[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Fix: Changed NodeJS.Timeout to number for browser compatibility.
  const slideTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Estimate slide durations based on narration word count (180 WPM)
    const averageWPM = 180;
    const durations = slides.map(slide => {
      const wordCount = slide.narration.split(/\s+/).length;
      return (wordCount / averageWPM) * 60 * 1000; // duration in ms
    });
    setSlideDurations(durations);
  }, [slides]);

  const scheduleNextSlide = useCallback(() => {
    if (slideTimeoutRef.current) {
      clearTimeout(slideTimeoutRef.current);
    }
    
    if (currentSlideIndex < slides.length - 1) {
      slideTimeoutRef.current = setTimeout(() => {
        setCurrentSlideIndex(prev => prev + 1);
      }, slideDurations[currentSlideIndex]);
    } else {
      setIsPlaying(false);
    }
  }, [currentSlideIndex, slides.length, slideDurations]);

  useEffect(() => {
    if (isPlaying) {
      scheduleNextSlide();
    } else if (slideTimeoutRef.current) {
      clearTimeout(slideTimeoutRef.current);
    }
    
    return () => {
      if (slideTimeoutRef.current) {
        clearTimeout(slideTimeoutRef.current);
      }
    };
  }, [isPlaying, currentSlideIndex, scheduleNextSlide]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
       if (audio.ended || currentSlideIndex === slides.length -1) {
        setCurrentSlideIndex(0);
        audio.currentTime = 0;
      }
      audio.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };
  
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const onEnded = () => {
        setIsPlaying(false);
        setCurrentSlideIndex(slides.length - 1);
    };
    
    audio.addEventListener('ended', onEnded);
    
    return () => {
        audio.removeEventListener('ended', onEnded);
    };
  }, [slides.length]);

  const currentSlide = slides[currentSlideIndex];
  const progressPercentage = ((currentSlideIndex + 1) / slides.length) * 100;

  return (
    <div className="w-full max-w-4xl mx-auto bg-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      <div className="relative w-full aspect-video bg-black group">
        {slides.map((slide, index) => (
          <img
            key={index}
            src={slide.imageUrl}
            alt={slide.title}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out ${
              index === currentSlideIndex ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-6 flex flex-col justify-end">
          <h2 className="text-3xl font-bold text-white drop-shadow-lg">{currentSlide.title}</h2>
          <p className="text-lg text-gray-200 mt-2 drop-shadow-md">{currentSlide.narration}</p>
        </div>
      </div>

      <div className="p-4 bg-gray-700/50 flex items-center gap-4">
        <button
          onClick={handlePlayPause}
          className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
        >
          {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
        </button>
        <div className="w-full bg-gray-600 rounded-full h-2.5">
          <div
            className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300 ease-linear"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <span className="text-sm font-mono text-gray-400">{currentSlideIndex + 1} / {slides.length}</span>
      </div>

      <audio ref={audioRef} src={audioUrl} className="hidden" />
    </div>
  );
};

export default PresentationViewer;
