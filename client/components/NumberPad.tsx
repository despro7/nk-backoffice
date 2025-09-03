import { Button } from "@heroui/button";

interface NumberPadProps {
  onNumberClick: (number: string) => void;
  onBackspace: () => void;
}

export function NumberPad({ onNumberClick, onBackspace }: NumberPadProps) {
  const numbers = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0', 'backspace']
  ];

  const handleClick = (value: string) => {
    if (value === 'backspace') {
      onBackspace();
    } else {
      onNumberClick(value);
    }
  };

  return (
    <div className="flex flex-col items-start bg-white rounded-lg shadow-sm w-full overflow-clip">
      {numbers.map((row, rowIndex) => (
        <div key={rowIndex} className={`flex h-[80px] items-center w-full ${rowIndex < numbers.length - 1 ? 'border-b border-gray-200' : ''}`}>
          {row.map((value, colIndex) => (
            <Button
              key={value}
              onPress={() => handleClick(value)}
              variant="light"
              size="lg"
              disableRipple={true}
              className={`
                flex-1 h-full rounded-none text-gray-700 text-[26px] font-semibold
                ${colIndex === 1 ? 'border-x border-gray-200' : ''}
                hover:bg-gray-50 active:bg-gray-100 data-[pressed=true]:scale-100 data-[pressed=true]:bg-neutral-200`}
            >
              {value === 'backspace' ? (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 33 33"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M10.8939 5.8335H25.6672C26.7281 5.8335 27.7455 6.25492 28.4956 7.00507C29.2458 7.75521 29.6672 8.77263 29.6672 9.8335V23.1668C29.6672 24.2277 29.2458 25.2451 28.4956 25.9953C27.7455 26.7454 26.7281 27.1668 25.6672 27.1668H10.8939C10.3168 27.1668 9.7465 27.0419 9.22222 26.8007C8.69793 26.5595 8.23205 26.2077 7.85654 25.7695L2.14321 19.1028C1.52207 18.3779 1.18066 17.4548 1.18066 16.5002C1.18066 15.5455 1.52207 14.6224 2.14321 13.8975L7.85654 7.23083C8.23205 6.7926 8.69793 6.44081 9.22222 6.19961C9.7465 5.95841 10.3168 5.83351 10.8939 5.8335ZM14.0579 12.8908C14.3079 12.6409 14.647 12.5004 15.0005 12.5004C15.3541 12.5004 15.6932 12.6409 15.9432 12.8908L17.6672 14.6148L19.3912 12.8908C19.5142 12.7635 19.6613 12.6619 19.824 12.592C19.9867 12.5221 20.1616 12.4854 20.3387 12.4838C20.5157 12.4823 20.6913 12.516 20.8551 12.5831C21.019 12.6501 21.1679 12.7491 21.2931 12.8743C21.4183 12.9995 21.5173 13.1484 21.5843 13.3122C21.6513 13.4761 21.6851 13.6517 21.6835 13.8287C21.682 14.0057 21.6452 14.1807 21.5753 14.3434C21.5055 14.506 21.4039 14.6532 21.2765 14.7762L19.5525 16.5002L21.2765 18.2242C21.5194 18.4756 21.6538 18.8124 21.6508 19.162C21.6477 19.5116 21.5075 19.846 21.2603 20.0933C21.0131 20.3405 20.6787 20.4807 20.3291 20.4837C19.9795 20.4868 19.6427 20.3524 19.3912 20.1095L17.6672 18.3855L15.9432 20.1095C15.8202 20.2368 15.6731 20.3384 15.5104 20.4083C15.3477 20.4782 15.1728 20.515 14.9957 20.5165C14.8187 20.518 14.6431 20.4843 14.4793 20.4173C14.3154 20.3502 14.1665 20.2512 14.0414 20.126C13.9162 20.0008 13.8172 19.852 13.7501 19.6881C13.6831 19.5242 13.6493 19.3487 13.6509 19.1716C13.6524 18.9946 13.6892 18.8196 13.7591 18.657C13.829 18.4943 13.9305 18.3472 14.0579 18.2242L15.7819 16.5002L14.0579 14.7762C13.8079 14.5261 13.6675 14.187 13.6675 13.8335C13.6675 13.4799 13.8079 13.1409 14.0579 12.8908Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                value
              )}
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}
