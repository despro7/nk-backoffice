const NovaPoshtaIcon = '/icons/nova-poshta.svg';
const UkrPoshtaIcon = '/icons/ukr-poshta.svg';

interface Order {
    id: string | undefined;
    shipping: {
        provider: string;
        trackingId: string;
        carrier: string;
    };
}

interface OrderTrackingNumberProps {
    order: Order;
}

const OrderTrackingNumber = ({ order }: OrderTrackingNumberProps) => {
    const { shipping } = order;
    const isNovaPoshta = shipping.provider === 'novaposhta';

    // Функция для форматирования ТТН
    const formatTrackingNumber = (trackingId: string) => {
        if (!trackingId || trackingId === 'Не вказано') {
            return <span className="text-gray-500">ТТН не вказано</span>;
        }

        // Убираем все пробелы и приводим к строке
        const cleanId = trackingId.toString().replace(/\s/g, '');
        
        if (isNovaPoshta) {
            // Формат Нової Пошти: 20 4512 3266 5506
            if (cleanId.length === 14) {
                const part1 = cleanId.slice(0, 2);
                const part2 = cleanId.slice(2, 6);
                const part3 = cleanId.slice(6, 10);
                const part4 = cleanId.slice(10, 14);
                
                return (
                    <>
                        {part1} {part2} {part3} <span className="font-bold">{part4}</span>
                    </>
                );
            }
        } else {
            // Формат Укрпошти: 05037 6949 5578
            if (cleanId.length === 13) {
                const part1 = cleanId.slice(0, 5);
                const part2 = cleanId.slice(5, 9);
                const part3 = cleanId.slice(9, 13);
                
                return (
                    <>
                        {part1} {part2} <span className="font-bold">{part3}</span>
                    </>
                );
            }
        }
        
        // Если формат не распознан, возвращаем как есть
        return <span className="font-mono">{trackingId}</span>;
    };

    return (
        <div className="w-full">
            <div className="bg-neutral-50 p-4 rounded-lg">
                <div className="flex items-center gap-2.5">
                    <img src={isNovaPoshta ? NovaPoshtaIcon : UkrPoshtaIcon} alt={shipping.carrier} className="w-6 h-6" />
                    <div className="text-2xl font-mono tracking-wider text-primary">
                        {formatTrackingNumber(shipping.trackingId)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderTrackingNumber;