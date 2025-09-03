<?php

// --- Глобальні налаштування ---
$host = 'localhost';         // Хост бази даних MySQL
$dbname = '*********';       // Назва бази WooCommerce   // Додано в .env – WP_DBNAME
$user = '*********';         // Користувач бази          // Додано в .env – WP_USER
$password = '*********';     // Пароль користувача       // Додано в .env – WP_PASSWORD

// ---  Dilovod API ---
$apiUrl = '*********';     // Додано в .env – DILOVOD_API_URL
$apiKey = '*********';     // Додано в .env – DILOVOD_API_KEY

// --- Базова функція підключення до БД ---
function getPdo($host, $dbname, $user, $password) {
    return new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
}

// --- Функція отримання SKU товарів у наявності з WooCommerce ---
function getInStockSkus($pdo) {
    $sql = "
        SELECT pm.meta_value AS sku
        FROM wp_posts AS p
        JOIN wp_postmeta AS pm ON p.ID = pm.post_id
        WHERE p.post_type = 'product'
          AND p.post_status = 'publish'
          AND pm.meta_key = '_sku'
          AND EXISTS (
            SELECT 1
            FROM wp_postmeta AS stock_status
            WHERE stock_status.post_id = p.ID
              AND stock_status.meta_key = '_stock_status'
              AND stock_status.meta_value = 'instock'
          )
        LIMIT 100
    ";
    $stmt = $pdo->query($sql);
    $skus = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (empty($skus)) {
        throw new Exception('Не знайдено SKU товарів у наявності');
    }
    return array_map('trim', $skus);
}

// --- Базова функція запиту до Dilovod API ---
function dilovodApiRequest($apiUrl, $payload) {
    $ch = curl_init($apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json'
    ]);
    $response = curl_exec($ch);
    if (curl_errno($ch)) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new Exception('Помилка CURL: ' . $error);
    }
    curl_close($ch);
    return json_decode($response, true);
}

// --- Функція отримання залишків по списку SKU ---
function getDilovodBalance($apiUrl, $apiKey, $skus_filtered) {
    $payload = [
        "version" => "0.25",
        "key" => $apiKey,
        "action" => "request",
        "params" => [
            "from" => [
                "type" => "balance",
                "register" => "goods",
                "date" => date("Y-m-d 00:00:00"),
                "dimensions" => ["good", "storage"]
            ],
            "fields" => [
                "good" => "good",
                "good.productNum" => "sku",
                "storage" => "storage",
                "qty" => "qty"
            ],
            "filters" => [
                [
                    "alias" => "sku",
                    "operator" => "IL",
                    "value" => $skus_filtered
                ]
                // Можна додати фільтр по складу або залишку
            ]
        ]
    ];
    $response = dilovodApiRequest($apiUrl, $payload);
    
    $output = [];

    foreach ($response as $good) {
        $sku = $good['sku'];

        // Якщо товар уже є в $output, просто оновлюємо його залишки
        if (isset($output[$sku])) {
            if ($good['storage'] === '1100700000001005') {
                $output[$sku]['stockBalanceByStock']['1'] = $good['qty'];
            } elseif ($good['storage'] === '1100700000001017') {
                $output[$sku]['stockBalanceByStock']['2'] = $good['qty'];
            }
        } else {
            // Ініціалізація нового запису
            $output[$sku] = [
                // "data" => $good,
                "id" => $sku,
                "name" => $good['good__pr'],
                "stockBalanceByStock" => [
                    "1" => ($good['storage'] === '1100700000001005') ? $good['qty'] : 0,
                    "2" => ($good['storage'] === '1100700000001017') ? $good['qty'] : 0
                ]
            ];
        }
    }
    
    $output = array_values($output);

    return $output;
}

// --- Функція отримання списку товарів з Dilovod по sku ---
function getDilovodGoodsBySku($apiUrl, $apiKey, $skus_filtered) {
    $payload = [
        "version" => "0.25",
        "key" => $apiKey,
        "action" => "request",
        "params" => [
            "from" => "catalogs.goods",
            "fields" => [
                "id" => "id",
                "productNum" => "sku",
                "parent" => "parent"
            ],
            "filters" => [
                [
                    "alias" => "sku",
                    "operator" => "IL",
                    "value" => $skus_filtered
                ]
            ]
        ]
    ];
    return dilovodApiRequest($apiUrl, $payload);
}

// --- Функція отримання інформації по товарам з Dilovod із комплектами по sku ---
function getGoodsInfoWithSetsOptimized($apiUrl, $apiKey, $skuList) {
    $result = [];
    $goodsById = [];
    $setParentId = "1100300000001315"; // ID групи-комплектів

    // 1. Витягуємо основні поля для всіх SKU групами
	$payload = [
		"version" => "0.25",
		"key" => $apiKey,
		"action" => "request",
		"params" => [
			"from" => [
				"type" => "sliceLast",
				"register" => "goodsPrices",
				"date" => date("Y-m-d 00:00:00"),
			],
			"fields" => [
				"good" => "id",
				"good.productNum" => "sku",
				"good.parent" => "parent",
				"priceType" => "priceType",
            	"price" => "price",
			],
			"filters" => [
				[
					"alias" => "sku",
					"operator" => "IL",
					"value" => $skuList
				]
			]
		]
	];
	$response = dilovodApiRequest($apiUrl, $payload);

    $idToSku = [];
	$pricesByGoodId = [];
	if (!empty($response)) {
		foreach ($response as $row) {
			$id = $row['id'];
			$sku = $row['sku'];
			$pricesByGoodId[$id][] = [
				'priceType' => $row['priceType'],
				'price' => $row['price'],
			];
            $idToSku[$id] = $sku;
		}
	}

    // 2. Для КОМПЛЕКТІВ (parent == "1100300000001315") ― окремий getObject та збір складу
    foreach ($response as &$good) {
        if ($good['parent'] === $setParentId) {
            $payload = [
                "version" => "0.25",
                "key" => $apiKey,
                "action" => "getObject",
                "params" => [
                    "id"  => $good['id']
                ]
            ];
            $object = dilovodApiRequest($apiUrl, $payload);

            // die( json_encode($object, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) );

            $set = [];
            if (
                !empty($object["tableParts"]["tpGoods"]) &&
                is_array($object["tableParts"]["tpGoods"])
            ) {
                foreach ($object["tableParts"]["tpGoods"] as $row) {
                    $id = (string)$row["good"];
                    $sku = isset($idToSku[$id]) ? $idToSku[$id] : $id;

                    $set[] = [
                        "id" => $sku,
                        "quantity" => (float)$row["qty"]
                    ];
                }
            }
            $good['set'] = $set;
			sleep(0.15);
        } else {
            $good['set'] = []; // не комплект, масив set буде []
        }
    }
    unset($good);

	
    $output = [];
    foreach ($response as $good) {
		$mainPriceType = '1101300000001001'; // Роздріб (Інтернет-магазин)
		$costPerItem = '';
		$additionalPrices = [];
		$currency = 'UAH';

		// Заповнюємо масив усіх цін по товару
		$prices = isset($pricesByGoodId[$good['id']]) ? $pricesByGoodId[$good['id']] : [];
		
		// die( json_encode($prices, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) );

		foreach ($prices as $priceRow) {
			if ($priceRow['priceType'] == $mainPriceType) {
				$costPerItem = $priceRow['price'];
			} else {
				$additionalPrices[] = [
					"priceType" => getPriceTypeNameById($priceRow['priceType']),
					"priceValue" => $priceRow['price']
				];
			}
		}

		$filteredAdditionalPrices = array_filter(
			$additionalPrices,
			function($p) { return floatval($p['priceValue']) > 0; }
		);

		$categoriesMap = [
			"Перші страви" => 1,
			"Другі страви" => 2,
			"Набори продукції" => 3
		];

        $output[] = [
            "id" => $good['sku'],
            "name" => $good['id__pr'],
            "sku" => $good['sku'],
			"costPerItem" => $costPerItem,
			"currency" => "UAH",
			"category" => [
				"id" => isset($categoriesMap[$good['parent__pr']]) ? $categoriesMap[$good['parent__pr']] : 0,
				"name" => $good['parent__pr']
			],
            "set" => isset($good['set']) ? $good['set'] : [],
			"additionalPrices" => array_values($filteredAdditionalPrices),
        ];
    }

	$unique = [];
	foreach ($output as $item) {
		$unique[$item['sku']] = $item; // ключ: sku товару
	}
	$output = array_values($unique);

    return $output;
}


function getPriceTypeNameById($id) {
    $map = [
        "1101300000001006" => "Акційна",
        "1101300000001003" => "Дрібний опт",
        "1101300000001004" => "Опт (мережі магазинів)",
        "1101300000001005" => "Роздріб (Розетка)",
        "1101300000001002" => "Дрібний опт (Славутич)",
        "1101300000001008" => "Вако трейд",
        "1101300000001012" => "Військові",
        "1101300000001001" => "Роздріб (Інтернет-магазин)",
        "1101300000001007" => "Звичайна",
        "1101300000001013" => "Роздріб(Пром)"
    ];

    return $map[$id] ?? "Невідомо";
}


// --- Оновлення в SalesDrive ---

$salesdriveUrl = "https://nk-food.salesdrive.me/product-handler/";
$salesdriveFormKey = "s3kGzIx297-B-amD0HGa-RyGx7l6FRWzo1ryk8OKuBipGam5myFUJ";

// --- Функція завантаження/оновлення товарів в SalesDrive ---
function pushToSalesDrive($salesdriveUrl, $salesdriveFormKey, $products, $dontUpdateFields = []) {
    $payload = [
        "form" => $salesdriveFormKey,
        "action" => "update",
        "dontUpdateFields" => $dontUpdateFields,
        "product" => $products
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $salesdriveUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type:application/json; charset=utf-8']);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}

// --- Функція видалення товарів в SalesDrive ---
function deleteSalesDriveProducts($salesdriveUrl, $salesdriveFormKey, $products) {
    $payload = [
        "form" => $salesdriveFormKey,
        "action" => "delete",
        "product" => $products
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $salesdriveUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type:application/json; charset=utf-8']);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}


// --- Функція отримання метаданих з Dilovod ---
function getDilovodMetadata($apiUrl, $apiKey, $skus_filtered) {
    $payload = [
        "version" => "0.25",
        "key" => $apiKey,
        // "action" => "listMetadata",
        "action" => "getMetadata",
        "params" => [
            "objectName" => "documents.prodReport",
            "lang" => "uk",
        ]
    ];
    return dilovodApiRequest($apiUrl, $payload);
}


// --- Функція запиту останніх 10 документів переміщення між складами з Dilovod ---
function getDilovodGoodMoving($apiUrl, $apiKey, $skus_filtered) {
    $payload = [
        "version" => "0.25",
        "key" => $apiKey,
        "action" => "request",
        "params" => [
            "from" => "documents.prodReport",
        ],
        "fields" => [
            "id" => "id",
            "date" => "date",
            "number" => "number",
            // "firm" => "firm",
            // "storage" => "storage",
            // "storageTo" => "storageTo",
            // "author" => "author",
        ],
        "order" => [
            [ "alias" => "date", "direction" => "desc" ],
            [ "alias" => "id", "direction" => "desc" ]
        ]
    ];
    return dilovodApiRequest($apiUrl, $payload);
}



// --- Dispatcher за action ---
header('Content-Type: application/json; charset=utf-8');
$action = isset($_GET['action']) ? $_GET['action'] : 'default';

try {
    $pdo = getPdo($host, $dbname, $user, $password);

    // Універсально отримуємо sku з WooCommerce
    $skus_filtered = getInStockSkus($pdo);

    switch ($action) {
        case 'get_meta':
            $output = getDilovodMetadata($apiUrl, $apiKey, $skus_filtered);
            break;
        
        case 'good_moving':
            $output = getDilovodGoodMoving($apiUrl, $apiKey, $skus_filtered);
            break;
        
        case 'balance':
            $output = getDilovodBalance($apiUrl, $apiKey, $skus_filtered);
            break;

        case 'goods':
            $output = getDilovodGoodsBySku($apiUrl, $apiKey, $skus_filtered);
            break;

		case 'goods_with_sets':
			$output = getGoodsInfoWithSetsOptimized($apiUrl, $apiKey, $skus_filtered);
        	file_put_contents('wp-content/dilovod_salesdrive_sync/products_update.json', json_encode($output, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
			break;

		case 'sd_update_prod':
			// Варіант 1: беремо з файлу попередньо збережені товари (якщо ручний пуш)
			// $products = json_decode(file_get_contents('products_update.json'), true);
			// Варіант 2 (авто оновлення) — просто отримати свіжий масив:
			$products = getGoodsInfoWithSetsOptimized($apiUrl, $apiKey, $skus_filtered);
	
			$result = pushToSalesDrive($salesdriveUrl, $salesdriveFormKey, $products);
			$output = [
				'salesdrive_response' => $result,
				'products_updated' => count($products)
			];
			break;
        
        case 'sd_update_prod_manual':
            $products = json_decode(file_get_contents('wp-content/dilovod_salesdrive_sync/products_update.json'), true);
    
            $result = pushToSalesDrive($salesdriveUrl, $salesdriveFormKey, $products);
            $output = [
                'salesdrive_response' => $result,
                'products_updated' => count($products)
            ];
            break;

        case 'sd_balance_update':
            $products = getDilovodBalance($apiUrl, $apiKey, $skus_filtered);
            $dontUpdateFields = ['price', 'discount', 'name', 'description', 'images', 'nameForDocuments', 'nameTranslate', 'descriptionTranslate', 'expenses', 'sku', 'manufacturer', 'weight', 'volume', 'length', 'width', 'height', 'barcode', 'uktzed', 'exciseCode', 'url', 'note', 'supplier', 'keywords', 'params', 'country', 'set'];
    
            $result = pushToSalesDrive($salesdriveUrl, $salesdriveFormKey, $products, $dontUpdateFields);
            $output = [
                'salesdrive_response' => $result,
                'products_balance_update' => count($products)
            ];
            break;

        case 'sd_del_prod':
            $products = json_decode(file_get_contents('wp-content/dilovod_salesdrive_sync/products_delete.json'), true);
    
            $result = deleteSalesDriveProducts($salesdriveUrl, $salesdriveFormKey, $products);
            $output = [
                'salesdrive_response' => $result,
                'products_deleted' => count($products)
            ];
            break;

        default:
            $output = ['error' => 'Невідома дія'];
    }

    echo json_encode($output, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}