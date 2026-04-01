import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { DynamicIcon } from "lucide-react/dynamic";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <p className="text-base mb-2 text-neutral-400">Помилка 404</p>
        <p className="text-4xl text-neutral-700 font-bold mb-4 ">Сторінка не знайдена</p>
        <p className="text-lg mb-4 text-neutral-500 max-w-md leading-snug">Можливо, ви перейшли за неіснуючим посиланням або сторінка була переміщена.</p>
        <a href="/" className="bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-2 font-medium px-4 py-3 pr-5 mt-3 rounded-md cursor-pointer transition-colors duration-200">
          <DynamicIcon name="arrow-left" size={20} />
          Повернутися на головну
        </a>
      </div>
    </div>
  );
};

export default NotFound;
