DROP TABLE IF EXISTS fulfillment_order_ratings;
DROP TABLE IF EXISTS fulfillment_order_location_updates;
DROP TABLE IF EXISTS fulfillment_order_events;
DROP TABLE IF EXISTS fulfillment_order_items;
DROP TABLE IF EXISTS fulfillment_orders;
ALTER TABLE product_listings DROP COLUMN IF EXISTS controlled_item, DROP COLUMN IF EXISTS requires_prescription;
