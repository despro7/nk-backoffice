
import React, { useEffect, useState } from 'react';
import { playSoundChoice, SOUND_CHOICES } from '../lib/soundUtils';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import { Select, SelectItem } from '@heroui/select';
import { Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { OrderSoundEvent } from '@/components/OrderSoundSettings';

// SOUND_CHOICES импортируется из soundUtils

const DEFAULT_SOUND_SETTINGS: Record<OrderSoundEvent, string> = {
	pending: 'default',
	success: 'default',
	done: 'default',
	error: 'default',
};

export const OrderSoundSettingsCard: React.FC = () => {
	const [soundSettings, setSoundSettings] = useState<Record<OrderSoundEvent, string>>(DEFAULT_SOUND_SETTINGS);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setLoading(true);
		fetch('/api/settings/equipment', { credentials: 'include' })
			.then(res => res.json())
			.then(data => {
				if (data?.data?.orderSoundSettings) {
					setSoundSettings({ ...DEFAULT_SOUND_SETTINGS, ...data.data.orderSoundSettings });
				}
			})
			.catch(() => setError('Ошибка загрузки настроек'))
			.finally(() => setLoading(false));
	}, []);

	const handleChange = (event: OrderSoundEvent, value: string) => {
		const updated = { ...soundSettings, [event]: value };
		setSoundSettings(updated);
		playSoundChoice(value, event);
	};

	const handleSave = () => {
		setSaving(true);
		setError(null);
		fetch('/api/settings/equipment', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ orderSoundSettings: soundSettings }),
		})
			.then(res => res.json())
			.then(data => {
				if (!data.success) throw new Error();
			})
			.catch(() => setError('Ошибка сохранения'))
			.finally(() => setSaving(false));
	};

	return (
		<Card className={`flex-1 h-fit relative ${saving ? 'opacity-60 pointer-events-none' : ''}`}>
			<CardHeader className="border-b px-5">
				<h3 className="font-semibold text-gray-900">Звуки подій при збірці замовлення</h3>
			</CardHeader>

			<CardBody className="p-5 grid grid-cols-2 gap-6">
				{(['pending', 'success', 'done', 'error'] as OrderSoundEvent[]).map((event) => (
				<div key={event} className="flex flex-col gap-1">
					<div className="flex items-end gap-2">
						<Select
							id={event}
							label={
								event === 'pending' ? 'Очікування (pending)' :
								event === 'success' ? 'Успіх (success)' :
								event === 'done' ? 'Завершено (done)' :
								event === 'error' ? 'Помилка (error)' : event
							}
							labelPlacement="outside"
							selectedKeys={[soundSettings[event]]}
							onSelectionChange={(keys) => {
								const value = Array.from(keys)[0] as string;
								handleChange(event, value);
							}}
							classNames={{ label: 'block text-xs font-medium text-gray-700 mb-1' }}
						>
							{SOUND_CHOICES.map(opt => (
								<SelectItem key={opt.value}>{opt.label}</SelectItem>
							))}
						</Select>

						<Button
							isIconOnly
							size="md"
							variant="flat"
							color="secondary"
							aria-label="Прослухати звук"
							onPress={() => playSoundChoice(soundSettings[event], event)}
							className="ml-1 text-neutral-600"
						>
							<DynamicIcon name="volume-2" size={18} />
						</Button>
					</div>
				</div>
				))}
			
				<div className="flex col-span-2 mt-4">
					<Button
						isLoading={saving}
						onPress={handleSave}
						color="primary"
						size="md"
						variant="solid"
					>
						<DynamicIcon name="save" size={14} />
						Зберегти налаштування звуків
					</Button>
				</div>
			</CardBody>

			{loading && (
				<div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 z-20">
					<Spinner size="lg" color="primary" />

					<span className="mt-2 text-gray-700 font-medium">Завантаження...</span>
				</div>
			)}

			{saving && (
				<div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 z-20">
					<Spinner size="lg" color="primary" />

					<span className="mt-2 text-gray-700 font-medium">Налаштування зберігаються...</span>
				</div>
			)}

			{error && <div className="text-red-500 text-sm mt-2 col-span-2">{error}</div>}
		</Card>
	);
};
