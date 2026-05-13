use std::sync::Arc;
use tokio_postgres::Client;
use redis::aio::ConnectionManager;

#[derive(Clone)]
pub struct AppState {
    pub redis: Option<ConnectionManager>,
    pub pg: Option<Arc<Client>>,
}
