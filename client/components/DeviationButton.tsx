import { useState } from 'react';
import { Button } from "@heroui/react";
import { DynamicIcon } from 'lucide-react/dynamic';
import { DeviationModal } from './DeviationModal';

export const DeviationButton = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return null;
    return (
        <>
            <Button 
                color="danger" 
                size="lg" 
                className="w-full py-4 px-6 items-center justify-start h-15 font-medium shadow-button-danger"
                onPress={() => setIsModalOpen(true)}
            >
                <DynamicIcon name="bell-ring" strokeWidth={1.5} className="w-6 h-6" />
                Позначити відхилення порцій
            </Button>
            <DeviationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </>
    );
};