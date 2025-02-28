'use client';

interface RaceTrackProps {
  flashPosition: number;
  regularPosition: number;
}

export const RaceTrack = ({ flashPosition, regularPosition }: RaceTrackProps) => {
  return (
    <div className="w-full h-[400px] relative">
      <svg className="w-full h-full" viewBox="0 0 150 150" fill="none">
        <defs>
          <path id="track" d="M0,0c37-33,89-44,125-36s46,36,46,66s36,62,55,71c21,10,40,20,70,9s57-8,69,4c13,13,10,50-13,70c-20,17-43,60-46,92c-3,37-34,89-114,84c-87-5-99-89-95-117s25-97-7-130s-72-7-98-23S-32,28,0,0z"/>
        </defs>

        <g>
          {/* Track base */}
          <use href="#track" stroke="#C2B280" strokeWidth="45" />
          <use href="#track" stroke="#111" strokeWidth="29" />
          <use href="#track" stroke="#fff" strokeDasharray="3.5 7.1" />
          
          {/* Flash car */}
          <g style={{ transform: `translateX(${flashPosition}%)` }}>
            <circle cx="20" cy="20" r="8" fill="#FFD700" />
            <text x="20" y="23" textAnchor="middle" fill="#000" fontSize="12">⚡</text>
          </g>

          {/* Regular car */}
          <g style={{ transform: `translateX(${regularPosition}%)` }}>
            <circle cx="20" cy="40" r="8" fill="#4299E1" />
            <text x="20" y="43" textAnchor="middle" fill="#000" fontSize="12">🚗</text>
          </g>
        </g>
      </svg>

      {/* Speed indicators */}
      <div className="absolute bottom-4 left-4 bg-black/70 rounded-full p-4">
        <div className="text-2xl font-bold">⚡ {(flashPosition * 2).toFixed(0)} mph</div>
      </div>
      <div className="absolute bottom-4 right-4 bg-black/70 rounded-full p-4">
        <div className="text-2xl font-bold">🚗 {(regularPosition * 2).toFixed(0)} mph</div>
      </div>
    </div>
  );
}; 