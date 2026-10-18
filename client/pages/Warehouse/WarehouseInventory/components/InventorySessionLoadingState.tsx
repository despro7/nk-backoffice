import { Spinner } from '@heroui/react';
import { motion } from 'framer-motion';

interface InventorySessionLoadingStateProps {
  message: string;
}

export const InventorySessionLoadingState = ({ message }: InventorySessionLoadingStateProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className="flex flex-col items-center justify-center gap-4 py-16 px-6 bg-white rounded-xl border border-gray-200 shadow-sm"
  >
    <Spinner size="lg" color="primary" label={message} classNames={{ label: 'text-sm text-gray-600 mt-3 max-w-md text-center' }} />
  </motion.div>
);
