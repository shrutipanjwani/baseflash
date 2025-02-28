'use client';

import { motion } from 'framer-motion';

interface RaceTrackProps {
  flashPosition: number;
  regularPosition: number;
  isRacing: boolean;
  countdown: number | null;
}

export const RaceTrack = ({ 
  flashPosition, 
  regularPosition, 
  isRacing
}: RaceTrackProps) => {
  return (
    <div className="w-full h-[220px] md:h-[250px] relative bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
      {/* Track */}
      <div className="absolute inset-0 flex flex-col justify-center">
        <div className="h-32 md:h-40 bg-gray-100 relative">
          {/* Track markings */}
          <div className="absolute inset-0 border-t-2 border-b-2 border-gray-200">
            <div className="h-full flex items-center">
              <div className="w-full h-[1px] border-t-2 border-dashed border-gray-300"></div>
            </div>
          </div>
          
          {/* Lane divider */}
          <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-[2px] bg-gray-200 z-0"></div>
          
          {/* Start line */}
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-green-500 z-20"></div>
          
          {/* Finish line - checkered pattern */}
          <div className="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center z-20" 
               style={{ 
                 backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 10px, #fff 10px, #fff 20px)',
                 backgroundSize: '20px 20px'
               }}>
          </div>
          
          {/* Flash car (blue) */}
          <motion.div 
            className="absolute top-1/4 transform -translate-y-1/2 z-10 transition-all duration-300 ease-linear"
            style={{ left: `${flashPosition}%` }}
            initial={{ scale: 1 }}
            animate={isRacing ? { scale: [1, 1.05, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.5 }}
          >
            <img 
              src="/images/blue-car.png" 
              alt="Flashblock car" 
              className="h-10 w-16 md:h-12 md:w-20 object-contain"
            />
          </motion.div>
          
          {/* Regular car (red) */}
          <motion.div 
            className="absolute top-3/4 transform -translate-y-1/2 z-10 transition-all duration-300 ease-linear"
            style={{ left: `${regularPosition}%` }}
            initial={{ scale: 1 }}
            animate={isRacing ? { scale: [1, 1.05, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.5 }}
          >
            <img 
              src="/images/red-car-removebg-preview.png" 
              alt="Regular block car" 
              className="h-10 w-16 md:h-12 md:w-20 object-contain"
            />
          </motion.div>
        </div>
      </div>
      
      {/* Lane labels */}
      <div className="absolute bottom-4 left-4 text-xs md:text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded-full shadow-sm">
        Flashblock Lane (200ms)
      </div>
      <div className="absolute bottom-4 right-4 text-xs md:text-sm bg-red-100 text-red-700 px-2 py-1 rounded-full shadow-sm">
        Regular Block Lane (2s)
      </div>
    </div>
  );
};