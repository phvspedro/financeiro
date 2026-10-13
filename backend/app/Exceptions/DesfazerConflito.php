<?php

namespace App\Exceptions;

use RuntimeException;

/** A ação não pode ser desfeita porque o item mudou depois dela */
class DesfazerConflito extends RuntimeException {}
