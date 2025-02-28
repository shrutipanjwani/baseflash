'use client';

interface RaceTrackProps {
  flashPosition: number;
  regularPosition: number;
  flashSpeed: number;
  regularSpeed: number;
}

export const RaceTrack = ({ 
  flashPosition, 
  regularPosition, 
  flashSpeed,
  regularSpeed 
}: RaceTrackProps) => {
  return (
    <div className="w-full h-[200px] relative bg-gray-900 rounded-xl overflow-hidden">
      {/* Track */}
      <div className="absolute inset-0 flex flex-col justify-center">
        <div className="h-32 bg-gray-800 relative">
          {/* Track markings */}
          <div className="absolute inset-0 border-t-2 border-b-2 border-gray-700">
            <div className="h-full flex items-center">
              <div className="w-full h-[1px] border-t-2 border-dashed border-gray-500"></div>
            </div>
          </div>
          
          {/* Start line */}
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-white"></div>
          
          {/* Finish line - checkered pattern */}
          <div className="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center" 
               style={{ 
                 backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 10px, #fff 10px, #fff 20px)',
                 backgroundSize: '20px 20px'
               }}>
          </div>
          
          {/* Flash car (blue) */}
          <div 
            className="absolute top-1/4 transform -translate-y-1/2 z-10 transition-all duration-300 ease-linear"
            style={{ left: `${flashPosition}%` }}
          >
            <div className="flex items-center justify-center bg-blue-500 h-10 w-12 rounded-lg shadow-md">
              <span className="text-white text-lg">⚡</span>
            </div>
          </div>
          
          {/* Regular car (red) */}
          <div 
            className="absolute top-3/4 transform -translate-y-1/2 z-10 transition-all duration-300 ease-linear"
            style={{ left: `${regularPosition}%` }}
          >
            <div className="flex items-center justify-center bg-red-500 h-10 w-12 rounded-lg shadow-md">
              <span className="text-white text-lg">🚗</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Speed indicators */}
      <div className="absolute top-4 left-4 bg-black/70 rounded-lg px-3 py-1">
        <div className="text-base font-bold text-blue-400">⚡ {flashSpeed.toFixed(0)} mph</div>
      </div>
      <div className="absolute top-4 right-4 bg-black/70 rounded-lg px-3 py-1">
        <div className="text-base font-bold text-red-400">🚗 {regularSpeed.toFixed(0)} mph</div>
      </div>
      
      {/* Lane labels */}
      <div className="absolute bottom-4 left-4 text-sm text-blue-400">
        Flashblock Lane (200ms)
      </div>
      <div className="absolute bottom-4 right-4 text-sm text-red-400">
        Regular Block Lane (2s)
      </div>
    </div>
  );
};